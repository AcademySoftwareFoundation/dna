{
  description = "DNA development environment — host toolchain plus the backend's locked Python dependencies";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    pyproject-nix = {
      url = "github:pyproject-nix/pyproject.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    uv2nix = {
      url = "github:pyproject-nix/uv2nix";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    pyproject-build-systems = {
      url = "github:pyproject-nix/build-system-pkgs";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.uv2nix.follows = "uv2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, pyproject-nix, uv2nix, pyproject-build-systems }:
    let
      # backend/uv.lock is the single source of truth for Python packages:
      # every transitive dependency is pinned there by version and hash.
      # backend/requirements.txt is exported from it for Docker and CI (see
      # the shellHook), so all three install exactly the same set.
      workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = ./backend; };

      # Every locked package publishes a wheel for Python 3.11, so nothing is
      # built from source and no build-system overrides are needed.
      overlay = workspace.mkPyprojectOverlay { sourcePreference = "wheel"; };
    in
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          # mongodb-ce is SSPL, which nixpkgs classes as unfree. Allow just
          # that one rather than every unfree package.
          config.allowUnfreePredicate = pkg:
            builtins.elem (nixpkgs.lib.getName pkg) [ "mongodb-ce" ];
        };

        # Matches backend/Dockerfile (python:3.11-slim) and requires-python in
        # backend/pyproject.toml. Keep them in step.
        python = pkgs.python311;

        pythonSet =
          (pkgs.callPackage pyproject-nix.build.packages { inherit python; }).overrideScope
            (nixpkgs.lib.composeManyExtensions [
              pyproject-build-systems.overlays.wheel
              overlay
            ]);

        backendEnv = pythonSet.mkVirtualEnv "dna-backend-env" workspace.deps.default;
      in
      {
        packages.default = backendEnv;

        devShells.default = pkgs.mkShell {
          name = "dna";

          packages = [
            backendEnv
            pkgs.uv

            # nodejs_20 was dropped from nixpkgs (upstream EOL 2026-04-30).
            pkgs.nodejs_22

            pkgs.mongodb-ce
            pkgs.black
            pkgs.isort
            pkgs.docker-compose
          ];

          env = {
            # The environment comes from the lock via nix; uv is here only to
            # change the lock, never to install into a venv of its own.
            UV_NO_SYNC = "1";
            UV_PYTHON = "${backendEnv}/bin/python";
            UV_PYTHON_DOWNLOADS = "never";
          };

          shellHook = ''
            # Same import root as the container (PYTHONPATH=/app/src).
            export PYTHONPATH="$(git rev-parse --show-toplevel)/backend/src"

            echo "DNA dev shell"
            echo "  python      $(python --version 2>&1 | cut -d' ' -f2) (backend deps from backend/uv.lock)"
            echo "  node        $(node --version)"
            echo "  uv          $(uv --version | cut -d' ' -f2)"
            echo
            echo "To change a backend dependency, edit backend/pyproject.toml, then:"
            echo "  (cd backend && uv lock && uv export --frozen --no-hashes --no-emit-project -o requirements.txt)"
            echo "and re-enter the shell."
            echo
            echo "Tests still run in Docker (make -C backend test); this shell is for"
            echo "editing, linting and one-off scripts on the host."
          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}
