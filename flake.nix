{
  description = "Development environment for apps.debugjois.dev";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      # Platforms the development environment is expected to work on.
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # Every toolchain and CLI as one profile. Bundling them in a buildEnv keeps
      # propagated build inputs (e.g. awscli2's PYTHONPATH) out of the shell, and
      # lets Amp orbs put a single bin/ directory on PATH. npm and Go modules
      # stay managed by their lockfiles, not Nix.
      packages = forAllSystems (pkgs: {
        default = pkgs.buildEnv {
          name = "apps-debugjois-dev-tools";
          paths = with pkgs; [
            # Go backend. nixpkgs' default `go` can lag behind backend/go.mod, so use the newest release.
            go_latest
            gopls
            golangci-lint
            govulncheck

            # Node app and CDK infra (npm ships with Node.js).
            nodejs_latest

            # Cloud CLIs used for deploys and Google Drive Workload Identity setup.
            awscli2
            google-cloud-sdk

            # Podcast transcription: yt-dlp needs ffmpeg/ffprobe and Deno for YouTube challenges.
            yt-dlp
            ffmpeg-headless
            deno

            # Scripting helpers used by deploy and dependency-upgrade scripts.
            gh
            jq
            perl # shasum in infra/deploy.sh
            zip
            unzip

            # Version control used for local development.
            jujutsu
          ];
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShellNoCC {
          packages = [ self.packages.${pkgs.stdenv.hostPlatform.system}.default ];

          # Fail instead of letting `go` download a toolchain behind Nix's back.
          # Keep in sync with .agents/nix-env.sh, which exports the same for orbs.
          GOTOOLCHAIN = "local";
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
