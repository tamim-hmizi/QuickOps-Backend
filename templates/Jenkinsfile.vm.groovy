pipeline {
  agent { label 'vm' }

  environment {
    GITHUB_TOKEN = "{{githubToken}}"
    SONAR_PROJECT_KEY = "{{projectName}}"
    SONAR_HOST_URL = "{{SONAR_URL}}"
    SONAR_TOKEN = credentials('SONAR_TOKEN')
    NEXUS_CREDENTIALS = credentials('NEXUS')
    REGISTRY_URL = "quickops.dc2.cloudapp.xpressazure.com:5000"
  }

  stages {

    stage('Checkout Repositories') {
      steps {
        script {
          def BACKEND_REPOS = [{{backendRepos}}]
          def frontendUrl = "{{frontendRepo}}".replace('https://', '')
          sh "git clone https://${GITHUB_TOKEN}@${frontendUrl} frontend"

          BACKEND_REPOS.each { repo ->
            def cleanRepo = repo.replace('https://', '')
            def repoName = repo.tokenize('/').last().replace('.git', '')
            sh "git clone https://${GITHUB_TOKEN}@${cleanRepo} ${repoName}"
          }
        }
      }
    }

    stage('SonarQube Analysis') {
      steps {
        script {
          def BACKEND_REPOS = [{{backendRepos}}]

          dir('frontend') {
            withSonarQubeEnv('QuickOpsSonar') {
              sh """
                /opt/sonar-scanner/bin/sonar-scanner \
                  -Dsonar.projectKey=${SONAR_PROJECT_KEY}-frontend \
                  -Dsonar.sources=. \
                  -Dsonar.host.url=${SONAR_HOST_URL} \
                  -Dsonar.login=${SONAR_TOKEN}
              """
            }
          }

          BACKEND_REPOS.each { repo ->
            def repoName = repo.tokenize('/').last().replace('.git', '')
            dir(repoName) {
              withSonarQubeEnv('QuickOpsSonar') {
                sh """
                  /opt/sonar-scanner/bin/sonar-scanner \
                    -Dsonar.projectKey=${SONAR_PROJECT_KEY}-${repoName} \
                    -Dsonar.sources=. \
                    -Dsonar.host.url=${SONAR_HOST_URL} \
                    -Dsonar.login=${SONAR_TOKEN}
                """
              }
            }
          }
        }
      }
    }

    stage('Trivy Security Scan') {
      steps {
        script {
          def BACKEND_REPOS = [{{backendRepos}}]

          echo "🔍 Scanning Dockerfiles..."
          sh "trivy config frontend"

          BACKEND_REPOS.each { repo ->
            def repoName = repo.tokenize('/').last().replace('.git', '')
            sh "trivy config ${repoName}"
          }

          echo "🐳 Pre-building Frontend Docker image for security scan..."
          def imageName = "${SONAR_PROJECT_KEY}:frontend-${env.BUILD_ID}"
          sh "docker build -t ${imageName} ./frontend"
          sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"
        }
      }
    }

    stage('Push to Nexus') {
      steps {
        script {
          def BACKEND_REPOS = [{{backendRepos}}]
          def projectRepo = "${REGISTRY_URL}/${SONAR_PROJECT_KEY.toLowerCase()}"

          docker.withRegistry("http://${REGISTRY_URL}", "NEXUS") {
            // Frontend
            def frontendName = "frontend"
            def frontendTag = "${projectRepo}:${frontendName}-${env.BUILD_ID}"
            sh "docker build -t ${frontendTag} ./frontend"
            sh "docker push ${frontendTag}"

            // Backends
            BACKEND_REPOS.each { repo ->
              def originalRepoName = repo.tokenize('/').last().replace('.git', '')
              def imageTagName = originalRepoName.toLowerCase()
              def tag = "${projectRepo}:${imageTagName}-${env.BUILD_ID}"
              sh "docker build -t ${tag} ${originalRepoName}"
              sh "docker push ${tag}"
            }
          }
        }
      }
    }

    stage('Creating Infrastructure') {
      steps {
        script {
          echo "Creating Infrastructure programmatically..."
        }
      }
    }

    stage('Configurating Infrastructure') {
      steps {
        script {
          echo "Configuring Infrastructure programmatically..."
        }
      }
    }

    stage('Metrics added') {
      steps {
        script {
          echo "Configuring with prometheus programmatically..."
        }
      }
    }

    stage('dashboard added') {
      steps {
        script {
          echo "Configuring with grafana programmatically..."
        }
      }
    }

    stage('Deploy') {
      steps {
        echo "🚀 Deploying '${SONAR_PROJECT_KEY}'"
      }
    }
  }

  post {
    always {
      echo "🧹 Cleaning up workspace..."
      cleanWs()
      node('vm') {
        deleteDir()
      }
    }
  }
}
