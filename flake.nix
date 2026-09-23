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

        stack = import ./nix/stack.nix { inherit pkgs backendEnv; };
      in
      {
        packages.default = backendEnv;

        apps = {
          dev = { type = "app"; program = "${stack.dev}/bin/dna-dev"; };
          smoke = { type = "app"; program = "${stack.smoke}/bin/dna-smoke"; };
        };

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
            pkgs.process-compose
            pkgs.jq
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
            echo "Backend checks, as CI runs them:"
            echo "  (cd backend && pytest --cov-fail-under=90)"
            echo "  (cd backend && black --check src tests && isort --check-only src tests)"
            echo
            echo "Run the whole stack from this checkout (mongo, backend, frontend):"
            echo "  nix run .#dev      interactive, mock tracker, no auth"
            echo "  nix run .#smoke    start, check it works end to end, stop"

            # Mark the prompt so it is obvious this shell is active. The hook
            # runs after ~/.bashrc, so this wins over a prompt set there; the
            # guard keeps a nested shell from stacking the prefix.
            export DNA_DEV_SHELL=1
            case "$PS1" in
              *"(dna)"*) ;;
              *) PS1='\[\e[1;35m\](dna)\[\e[0m\] '"$PS1" ;;
            esac
          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}
