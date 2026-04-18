#!/bin/bash
set -e

PI="bilguudeiblgd@raspberrypi2"
PI_DIR="~/Project/ndk-online-shop"
IMAGE="medusa-prod"
SSH_KEY="$HOME/.ssh/id_rsa"
SSH_OPTS="-i $SSH_KEY"

echo "=== Building ARM64 image on Mac ==="
docker buildx build --platform linux/arm64 -f medusa/Dockerfile.prod -t $IMAGE ./medusa

echo "=== Saving image ==="
docker save $IMAGE | gzip > medusa-prod.tar.gz

echo "=== Sending to Pi ==="
scp $SSH_OPTS medusa-prod.tar.gz $PI:$PI_DIR/
scp $SSH_OPTS .env.prod $PI:$PI_DIR/
scp $SSH_OPTS docker-compose.prod.yml $PI:$PI_DIR/

echo "=== Loading image on Pi ==="
ssh $SSH_OPTS $PI "cd $PI_DIR && docker load < medusa-prod.tar.gz && rm medusa-prod.tar.gz"

echo "=== Starting containers ==="
ssh $SSH_OPTS $PI "cd $PI_DIR && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"

rm medusa-prod.tar.gz

echo "=== Done! ==="
echo "Logs: ssh $PI 'docker logs -f medusa_backend'"
