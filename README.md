# QuickOps Backend

QuickOps Backend is the REST API and deployment orchestrator of QuickOps, a DevOps-as-a-Service platform. It stores users and projects in MongoDB and, on deployment, generates and runs a complete delivery chain: SonarQube projects, a Jenkins pipeline, Terraform for a VM or AKS Engine for a Kubernetes cluster, Ansible playbooks, Prometheus targets and Grafana dashboards.

## Features

- Authentication: registration and login with bcrypt-hashed passwords and an account activation flag
- Project CRUD (`/api/projects`): frontend repository, backend repositories, GitHub token, AI recommendation and reasoning, deployment choice, public IP and DNS label
- Deployment (`POST /api/deploy`):
  - creates a SonarQube project for each repository
  - renders a Jenkinsfile (checkout, SonarQube analysis, Trivy scan, push to Nexus, infrastructure, configuration, metrics, dashboard, deploy), creates or updates the Jenkins pipeline, then triggers and monitors the build
  - **VM target**: renders a Terraform configuration, restores and uploads the Terraform state in Azure Blob Storage, applies it, then configures the VM with a generated Ansible playbook
  - **Kubernetes target**: generates an AKS Engine cluster definition and deploys the application with a generated Ansible/Kubernetes playbook (MongoDB, ingress controller, image pull secrets)
  - registers Prometheus scrape targets and creates a Grafana data source and dashboard
- Full Jenkins build log retrieval (`GET /api/logs/full/:jobName/:buildId`)

## Tech stack

Node.js, Express 5, MongoDB with Mongoose, bcryptjs, Axios, EJS templates, node-ssh, Azure SDK (identity, resources), prom-client, xml2js / xmlbuilder.

## Architecture

```
routes/       Express routers (auth, projects, deploy)
controllers/  Request handlers
services/     Jenkins, SonarQube, Terraform, Ansible, AKS Engine, Azure Blob, Prometheus, Grafana integrations
models/       Mongoose models (User, Project)
templates/    Jenkinsfile, Terraform, Ansible and AKS Engine templates
```

The frontend calls this API; the AI service provides the recommendation stored on each project. Jenkins, SonarQube, Nexus, Prometheus and Grafana run on the platform VM provisioned by QuickOps-IAC and configured by QuickOps-CAC.

## Authentication

Login returns a JWT (8 hours). Every `/api/projects`, `/api/deploy` and `/api/logs` route requires it as `Authorization: Bearer <token>`, and each user only sees, changes and deploys their own projects. GitHub tokens stay on the server: they are never returned by the API, and the AI analysis (`POST /api/projects/:id/analyze`) calls QuickOps-AI from the backend. Project names are unique across users because they name the Jenkins job, Terraform state and DNS label. The API is rate-limited, with a stricter limit on login and registration.

Set `JWT_SECRET` to a long random value (for example `openssl rand -hex 32`) and `AI_URL` to the QuickOps-AI service.

**Upgrading:** projects created before this change have no owner and are hidden. Assign them once in MongoDB:

```js
db.projects.updateMany({ owner: { $exists: false } }, { $set: { owner: db.users.findOne({ email: "you@example.com" })._id } })
```

## Tests

```bash
docker run -d --name mongo -p 27017:27017 mongo:9.0
MONGO_URI=mongodb://127.0.0.1:27017 npm test
```

The suite covers registration and login, project input validation (names and repository URLs are restricted because they reach Terraform, the Jenkinsfile and shell commands) and the Terraform generator. CI runs it with a MongoDB service container.

## Related repositories

| Repository | Role |
|---|---|
| [QuickOps-Frontend](https://github.com/tamim-hmizi/QuickOps-Frontend) | React web console |
| [QuickOps-Backend](https://github.com/tamim-hmizi/QuickOps-Backend) | Express/MongoDB API and deployment orchestrator |
| [QuickOps-AI](https://github.com/tamim-hmizi/QuickOps-AI) | FastAPI + LLM deployment recommender |
| [QuickOps-IAC](https://github.com/tamim-hmizi/QuickOps-IAC) | Terraform for the QuickOps platform VM |
| [QuickOps-CAC](https://github.com/tamim-hmizi/QuickOps-CAC) | Ansible configuration of the DevOps toolchain |

## Getting started

### Prerequisites

- Node.js 20+ and npm
- MongoDB
- `terraform`, `ansible-playbook` and AKS Engine on the PATH for deployments
- Reachable Jenkins, SonarQube, Prometheus and Grafana instances

### Install and run

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # node --watch server.js
npm start              # node server.js
```

The server listens on `PORT` (default `5000`). There is no automated test suite yet.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port |
| `MONGO_URI` | MongoDB connection string |
| `JENKINS_URL`, `JENKINS_USER`, `JENKINS_API_TOKEN` | Jenkins API access |
| `SONAR_URL`, `SONAR_TOKEN` | SonarQube API access |
| `PROMETHEUS_URL` | Prometheus instance |
| `GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS` | Grafana API access |
| `AZURE_STORAGE_SAS` | SAS token for the Terraform state container |

## Project context

RFC final year project, 2025, by Tamim Hmizi: https://tamim-hmizi.github.io/Portfolio/
