FROM ubuntu:24.04

# 基本パッケージのインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    unzip \
    sudo \
    iptables \
    && rm -rf /var/lib/apt/lists/*

# Dockerのインストール
RUN curl -fsSL https://get.docker.com | sh

# Docker daemonの設定（vfsストレージドライバを使用）
RUN mkdir -p /etc/docker && \
    echo '{"storage-driver": "vfs"}' > /etc/docker/daemon.json

# vscodeユーザーの作成とdockerグループへの追加
RUN useradd -m -s /bin/bash vscode && \
    usermod -aG docker vscode && \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# fnmのインストール（vscodeユーザーとして）
USER vscode
WORKDIR /home/vscode
RUN curl -fsSL https://fnm.vercel.app/install | bash

# .bashrcにfnm設定を追加
ENV PATH="/home/vscode/.local/share/fnm:$PATH"
RUN echo 'eval "$(fnm env)"' >> ~/.bashrc

# AWS CLIのインストール（rootで、アーキテクチャに応じて適切なバイナリを取得）
USER root
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip"; \
    else \
        AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"; \
    fi && \
    curl "$AWS_CLI_URL" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

USER vscode
WORKDIR /workspaces
