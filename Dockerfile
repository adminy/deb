# Global ARGs shared by all stages
ARG DEBIAN_FRONTEND=noninteractive

### first stage - builder ###
FROM debian:bullseye-slim as runner
ARG DEBIAN_FRONTEND
# Set HOME to a writable directory in case something wants to cache things
ENV HOME=/tmp
# install debos build and unit-test dependencies
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash -
# debos runtime dependencies
# ca-certificates is required to validate HTTPS certificates when getting debootstrap release file
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        apt-transport-https binfmt-support bmap-tools btrfs-progs busybox bzip2 \
        ca-certificates debootstrap dosfstools e2fsprogs equivs fdisk f2fs-tools \
        git gzip pigz libostree-1-1 libslirp-helper linux-image-amd64 \
        openssh-client parted pkg-config qemu-system-x86 qemu-user-static \
        qemu-utils rsync systemd systemd-container u-boot-tools unzip zip \
        gcc libc6-dev libostree-dev nodejs user-mode-linux xfsprogs xz-utils && \
    rm -rf /var/lib/apt/lists/*


LABEL org.label-schema.name "debos"
LABEL org.label-schema.description "Debian OS builder"
LABEL org.label-schema.vcs-url = "https://github.com/go-debos/debos"
LABEL org.label-schema.docker.cmd 'docker run \
  --rm \
  --interactive \
  --tty \
  --device /dev/kvm \
  --user $(id -u) \
  --workdir /recipes \
  --mount "type=bind,source=$(pwd),destination=/recipes" \
  --security-opt label=disable'

# debian's qemu-user-static package no longer registers binfmts
# if running inside a virtualmachine; dockerhub builds are inside a vm
RUN for arch in aarch64 alpha arm armeb cris hexagon hppa m68k microblaze mips mips64 mips64el mipsel mipsn32 mipsn32el ppc ppc64 ppc64le riscv32 riscv64 s390x sh4 sh4eb sparc sparc32plus sparc64 xtensa xtensaeb; do \
      update-binfmts --import qemu-$arch; \
    done

# Build debos
COPY . /deb
WORKDIR /deb
RUN npm i
ENTRYPOINT ["node /deb"]
