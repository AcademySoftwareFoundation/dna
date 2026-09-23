{
  description = "DNA development environment — host toolchain plus the two prodtrack SDKs that are not in nixpkgs";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Matches backend/Dockerfile (python:3.11-slim). Keep them in step.
        python = pkgs.python311;
        py = python.pkgs;

        # ------------------------------------------------------------------
        # Packages nixpkgs does not carry
        #
        # shotgun_api3 and ftrack-python-api are both absent from nixpkgs, and
        # ftrack pulls two more that are missing or wrong-versioned there.
        # ------------------------------------------------------------------

        # ftrack pins arrow <1 and means it: ftrack_api/entity/user.py calls
        # `arrow.now().replace(tzinfo="utc")`, and arrow 1.0 removed tzinfo
        # from .replace() (it moved to .to()). nixpkgs ships arrow 1.4, which
        # would raise at runtime, so this builds the version ftrack expects.
        arrow_0_17 = py.buildPythonPackage rec {
          pname = "arrow";
          version = "0.17.0";
          pyproject = true;

          src = pkgs.fetchFromGitHub {
            owner = "arrow-py";
            repo = "arrow";
            rev = version;
            hash = "sha256-a16rSojvEFO8Ash6iEwxhgp7h3tnSBJrbaWeE1K8xkU=";
          };

          build-system = [ py.setuptools ];
          dependencies = [ py.python-dateutil ];

          # The 0.17 suite predates the pytest in nixpkgs and is not what we
          # are here to verify.
          doCheck = false;

          pythonImportsCheck = [ "arrow" ];

          meta = {
            description = "Better dates and times for Python (pinned <1 for ftrack)";
            homepage = "https://github.com/arrow-py/arrow";
            license = pkgs.lib.licenses.asl20;
          };
        };

        # ftrack pins clique==1.6.1. That release was never tagged on GitHub
        # (its tags stop at 1.5.0), so this one comes from PyPI — the only
        # place 1.6.1 is published.
        clique = py.buildPythonPackage rec {
          pname = "clique";
          version = "1.6.1";
          pyproject = true;

          src = py.fetchPypi {
            inherit pname version;
            hash = "sha256-kBZcHPFi1N0brvg86qGvyIa0U+N5CU+ltg6kcNFzPmY=";
          };

          build-system = [ py.setuptools ];

          # Test deps are not packaged and the library is a hard dependency of
          # ftrack's session module, not something we are validating here.
          doCheck = false;

          pythonImportsCheck = [ "clique" ];

          meta = {
            description = "Manage collections of sequentially numbered items";
            homepage = "https://gitlab.com/4degrees/clique";
            license = pkgs.lib.licenses.asl20;
          };
        };

        shotgun-api3 = py.buildPythonPackage rec {
          pname = "shotgun_api3";
          version = "3.9.2";
          pyproject = true;

          src = pkgs.fetchFromGitHub {
            owner = "shotgunsoftware";
            repo = "python-api";
            rev = "v${version}";
            hash = "sha256-GlYJ7Nu79Tmb6c/57GQ1VRj/eDkncEXyrmU9OPLqU+Y=";
          };

          build-system = [ py.setuptools ];

          # No install_requires: it vendors httplib2 and friends under
          # shotgun_api3/lib.
          dependencies = [ ];

          # The suite wants live ShotGrid credentials.
          doCheck = false;

          pythonImportsCheck = [ "shotgun_api3" ];

          meta = {
            description = "Autodesk ShotGrid Python API";
            homepage = "https://github.com/shotgunsoftware/python-api";
            license = pkgs.lib.licenses.mit;
          };
        };

        ftrack-python-api = py.buildPythonPackage rec {
          pname = "ftrack-python-api";
          version = "3.0.6";
          pyproject = true;

          src = pkgs.fetchFromGitHub {
            owner = "ftrackhq";
            repo = "ftrack-python-api";
            rev = "v${version}";
            hash = "sha256-rUDUKvKFUSu3+8BQls2pzjxsyEIK2ZIDyx/VewIpOdo=";
          };

          # Upstream builds through poetry-dynamic-versioning, which reads the
          # version from a git tag. A source tarball has no .git, so the build
          # would produce 0.1.0. Pin the version and drop the plugin.
          # sphinx-notfound-page is a docs dependency listed as a runtime one;
          # keeping it would drag all of sphinx into the closure.
          postPatch = ''
            substituteInPlace pyproject.toml \
              --replace-fail 'version = "0.1.0"' 'version = "${version}"' \
              --replace-fail 'requires = ["poetry-core>=1.0.0", "poetry-dynamic-versioning>=1.0.0,<2.0.0"]' 'requires = ["poetry-core>=1.0.0"]' \
              --replace-fail 'build-backend = "poetry_dynamic_versioning.backend"' 'build-backend = "poetry.core.masonry.api"' \
              --replace-fail 'sphinx-notfound-page = "^1.0.4"' ""
            echo '__version__ = "${version}"' > source/ftrack_api/_version.py
          '';

          build-system = [ py.poetry-core ];

          dependencies = [
            py.requests
            py.platformdirs
            arrow_0_17
            clique
            py.pyparsing
            py.websocket-client
          ];

          # pyparsing <3 and websocket-client <1 are relaxed on purpose, unlike
          # arrow above. Both are used only by the event hub
          # (ftrack_api/event/expression.py and event/hub.py), and DNA connects
          # with auto_connect_event_hub=False — see FtrackProvider.connect. They
          # still have to import, which they do; only the event-subscription
          # paths would be at risk, and nothing in DNA reaches them.
          pythonRelaxDeps = [ "pyparsing" "websocket-client" ];

          # The suite wants a live ftrack server.
          doCheck = false;

          pythonImportsCheck = [ "ftrack_api" ];

          meta = {
            description = "ftrack Python API";
            homepage = "https://github.com/ftrackhq/ftrack-python-api";
            license = pkgs.lib.licenses.asl20;
          };
        };

        # The two SDKs on the interpreter, so `python -c "import ftrack_api"`
        # works straight out of the shell. Everything else comes from the venv
        # (see the shellHook) so the pinned versions in requirements.txt are
        # what actually runs.
        pythonEnv = python.withPackages (_: [ shotgun-api3 ftrack-python-api ]);

      in
      {
        packages = {
          inherit arrow_0_17 clique shotgun-api3 ftrack-python-api;
          default = pythonEnv;
        };

        devShells.default = pkgs.mkShell {
          name = "dna";

          packages = [
            pythonEnv
            pkgs.uv

            # nodejs_20 was dropped from nixpkgs (upstream EOL 2026-04-30).
            pkgs.nodejs_22

            pkgs.mongodb-ce
            pkgs.black
            pkgs.isort
            pkgs.docker-compose
          ];

          # Let the venv see the nix-provided SDKs rather than reinstalling
          # them, and keep uv from downloading its own interpreter.
          UV_PYTHON = "${pythonEnv}/bin/python";
          UV_PYTHON_DOWNLOADS = "never";

          shellHook = ''
            echo "DNA dev shell"
            echo "  python      $(${pythonEnv}/bin/python --version 2>&1 | cut -d' ' -f2) (shotgun_api3, ftrack_api built in)"
            echo "  node        $(node --version)"
            echo "  uv          $(uv --version | cut -d' ' -f2)"
            echo
            echo "Backend deps are NOT installed automatically — the pinned set in"
            echo "backend/requirements.txt is the source of truth and needs an index:"
            echo "  uv venv --system-site-packages backend/.venv"
            echo "  uv pip install --python backend/.venv -r backend/requirements.txt"
            echo
            echo "Tests still run in Docker (make -C backend test); this shell is for"
            echo "editing, linting and one-off scripts on the host."
          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}
