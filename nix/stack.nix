# Apps that run the whole project from the working tree on the host:
#
#   nix run .#dev     mongo + backend (auto-reload) + frontend (Vite) under
#                     process-compose, with the mock tracker and no auth.
#   nix run .#smoke   the same stack headless on spare ports; checks that the
#                     services answer and work together, then stops them.
#
# Both read the checkout they are run from, not a store copy, so they test
# uncommitted changes. See nix/stack-env.sh for the settings and overrides.
{ pkgs, backendEnv }:
let
  runtime = [
    backendEnv
    pkgs.mongodb-ce
    pkgs.nodejs_22
    pkgs.curl
    pkgs.jq
    pkgs.git
    pkgs.coreutils
  ];

  stackEnv = pkgs.writeText "dna-stack-env.sh" (builtins.readFile ./stack-env.sh);

  # process-compose would otherwise substitute $VARS itself, before the
  # shell sees them; leave that to the shell so they resolve at run time.
  processCompose = pkgs.writeText "dna-process-compose.json" (builtins.toJSON {
    version = "0.5";
    disable_env_expansion = true;
    processes = {
      mongo = {
        command = ''exec mongod --dbpath "$DNA_STATE/mongo" --port "$DNA_MONGO_PORT" --bind_ip 127.0.0.1'';
        readiness_probe = {
          exec.command = ''exec 3<>"/dev/tcp/127.0.0.1/$DNA_MONGO_PORT"'';
          period_seconds = 1;
          failure_threshold = 60;
        };
        shutdown.signal = 15;
      };

      api = {
        command = ''cd "$DNA_ROOT/backend" && exec uvicorn main:app --app-dir src --reload --reload-dir src --host 127.0.0.1 --port "$DNA_API_PORT"'';
        depends_on.mongo.condition = "process_healthy";
        readiness_probe = {
          exec.command = ''curl -fsS "http://127.0.0.1:$DNA_API_PORT/health"'';
          initial_delay_seconds = 1;
          period_seconds = 2;
          failure_threshold = 30;
        };
        availability.restart = "on_failure";
      };

      frontend = {
        command = ''cd "$DNA_ROOT/frontend" && exec npm run dev -- --host 127.0.0.1 --port "$DNA_FRONTEND_PORT" --strictPort'';
        readiness_probe = {
          exec.command = ''curl -fsS "http://127.0.0.1:$DNA_FRONTEND_PORT/"'';
          initial_delay_seconds = 1;
          period_seconds = 2;
          failure_threshold = 45;
        };
      };
    };
  });
in
{
  dev = pkgs.writeShellApplication {
    name = "dna-dev";
    runtimeInputs = runtime ++ [ pkgs.process-compose ];
    text = ''
      # shellcheck disable=SC1091
      . ${stackEnv}

      dna_require_ports
      dna_frontend_deps

      echo "DNA stack: frontend http://localhost:$DNA_FRONTEND_PORT  api http://localhost:$DNA_API_PORT/docs"
      echo "  tracker $PRODTRACK_PROVIDER, auth $AUTH_PROVIDER, state in $DNA_STATE"
      exec process-compose up \
        --config ${processCompose} \
        --log-file "$DNA_STATE/logs/process-compose.log" \
        --use-uds --unix-socket "$DNA_STATE/process-compose.sock" \
        "$@"
    '';
  };

  smoke = pkgs.writeShellApplication {
    name = "dna-smoke";
    runtimeInputs = runtime;
    text = builtins.replaceStrings [ "@stackEnv@" ] [ "${stackEnv}" ] (builtins.readFile ./smoke.sh);
  };
}
