{
  description = "Development environment for apps.debugjois.dev";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      # Current nixpkgs supports Linux and Apple Silicon, not Intel macOS.
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          node = pkgs.nodejs-slim_latest;
          npm = pkgs.stdenvNoCC.mkDerivation rec {
            pname = "npm";
            version = "12.2.0";
            src = pkgs.fetchurl {
              url = "https://registry.npmjs.org/npm/-/npm-${version}.tgz";
              hash = "sha512-ZsJjKpTnlmSXOLLXiU1xDCzC4Wlok4IwZmh/aw2KUuXytU7q6qMv/cUT7MoeSf95Slwuw/lRXYefGzGCspHPNQ==";
            };
            nativeBuildInputs = [ pkgs.makeWrapper ];
            dontBuild = true;
            installPhase = ''
              runHook preInstall
              mkdir -p "$out/lib/node_modules/npm"
              cp -r . "$out/lib/node_modules/npm/"
              for command in npm npx; do
                makeWrapper ${node}/bin/node "$out/bin/$command" \
                  --add-flags "$out/lib/node_modules/npm/bin/$command-cli.js"
              done
              runHook postInstall
            '';
          };
          ci = pkgs.buildEnv {
            name = "apps-debugjois-dev-ci-tools";
            paths = with pkgs; [
              go_latest
              node
              npm
              npm-check-updates
              awscli2
              gh
              git
              jq
              perl
              zip
              unzip
            ];
          };
        in
        {
          inherit ci;
          default = pkgs.buildEnv {
            name = "apps-debugjois-dev-tools";
            paths = with pkgs; [
              ci
              google-cloud-sdk
              yt-dlp
              ffmpeg-headless
              deno
              jujutsu
            ];
          };
        }
      );

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShellNoCC {
          packages = [ self.packages.${pkgs.stdenv.hostPlatform.system}.default ];

          GOTOOLCHAIN = "local";
          shellHook = ''
            export GOBIN="$HOME/.cache/apps-debugjois-dev/go-tools/bin"
            export PATH="$GOBIN:$PATH"
          '';
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
