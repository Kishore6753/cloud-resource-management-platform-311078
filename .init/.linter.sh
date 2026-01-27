#!/bin/bash
cd /home/kavia/workspace/code-generation/cloud-resource-management-platform-311078/cloud_resource_manager_backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

