{
  description = "DoneCheck reproducible development environment";

  inputs = {
    # Pinned to nixos-unstable so Node 22 and modern toolchain are available.
    # Reproducibility comes from flake.lock, not from the branch name itself;
    # updating nixpkgs requires explicitly running `nix flake update`.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        # pnpm is intentionally NOT taken from pkgs.pnpm to avoid it pulling a
        # different Node version. Instead Corepack (bundled with nodejs_22)
        # activates the pnpm version pinned by packageManager in package.json.
        # `corepack enable` cannot be used because the Nix store is read-only,
        # so we provide a `pnpm` shim that delegates to `corepack pnpm`,
        # guaranteeing pnpm runs on the same Node 22 as the rest of the shell.
        pnpmVersion = "11.8.0";
        pnpmShim = pkgs.writeShellScriptBin "pnpm" ''
          exec corepack pnpm "$@"
        '';
        buildPnpm = pkgs.pnpm_11.override { nodejs-slim = pkgs.nodejs-slim_22; };
        source = pkgs.lib.cleanSourceWith {
          src = ./.;
          filter = path: type:
            let name = baseNameOf path;
            in !(builtins.elem name [
              ".cache"
              ".git"
              ".turbo"
              "dist"
              "node_modules"
              "result"
            ]);
        };
        donecheck = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "donecheck";
          version = "0.1.0";
          src = source;
          CI = "true";

          nativeBuildInputs = [
            pkgs.makeWrapper
            pkgs.nodejs_22
            buildPnpm
            pkgs.pnpmConfigHook
          ];

          pnpmWorkspaces = [ "@donecheck/cli..." ];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src pnpmWorkspaces;
            pnpm = buildPnpm;
            fetcherVersion = 4;
            hash = "sha256-eY/lXZBc4zDTKEMXkggFqeXhf/jL35fLNYMikOheZIM=";
          };

          buildPhase = ''
            runHook preBuild
            pnpm --filter @donecheck/cli... build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out/lib/donecheck"
            cp apps/cli/dist/index.js "$out/lib/donecheck/index.js"
            makeWrapper ${pkgs.nodejs_22}/bin/node "$out/bin/donecheck" \
              --add-flags "$out/lib/donecheck/index.js"
            runHook postInstall
          '';

          meta = {
            description = "Verify whether implementation evidence satisfies a requirement";
            license = pkgs.lib.licenses.asl20;
            mainProgram = "donecheck";
          };
        });
      in
      {
        packages = {
          inherit donecheck;
          default = donecheck;
        };

        apps = {
          donecheck = flake-utils.lib.mkApp { drv = donecheck; };
          default = flake-utils.lib.mkApp { drv = donecheck; };
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpmShim
            ripgrep
            git
            python3
            gcc
            pkg-config
            gnumake
          ];

          shellHook = ''
            # Cache corepack-managed pnpm in a writable, project-local dir so
            # the Nix store stays untouched. COREPACK_HOME is inherited by the
            # pnpm shim, so every `pnpm` invocation resolves to the same
            # corepack-managed binary running on Node 22.
            export COREPACK_HOME="$PWD/.cache/corepack"
            mkdir -p "$COREPACK_HOME"
            corepack prepare pnpm@${pnpmVersion} --activate
            echo "DoneCheck devShell"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "pnpm runs on Node: $(pnpm exec node --version)"
          '';
        };
      });
}
