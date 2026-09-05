#!/bin/sh

set -e

# The role dictates the startup behavior
ROLE=${ROLE:-api}

echo "Starting container with ROLE=$ROLE"

if [ "$ROLE" = "migrate" ]; then
  echo "Running database migrations..."
  cd database
  npx prisma migrate deploy
  echo "Migrations complete!"
  # In Kubernetes this would just exit successfully. 
  # In docker-compose, this container can just stay alive doing nothing or exit.
  # Let's exit so compose wait condition completes.
  exit 0
elif [ "$ROLE" = "api" ] || [ "$ROLE" = "worker" ] || [ "$ROLE" = "scheduler" ]; then
  echo "Starting Node.js process for $ROLE..."
  exec npm run start --workspace=backend
else
  echo "Unknown ROLE: $ROLE"
  exit 1
fi
