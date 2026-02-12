# ZPWA

A Spring Boot REST API application built with Kotlin, providing work order and equipment management capabilities.

### Frameworks & Libraries

| Technology | Version |
|---|---|
| Kotlin | 2.3.10 |
| Spring Boot | 4.0.2 |
| Gradle | 9.3.1 |
| Java (Eclipse Temurin) | 21 |
| SpringDoc OpenAPI | 3.0.1 |
| Jackson | 3.0.4 |
| Caffeine Cache | 3.2.3 |
| Logback | 1.5.29 |

### Running the Application

#### Spring Boot (Direct)

Run the application directly using Gradle:

```bash
./gradlew :zpwa-api:bootRun
```

The API will be available at `http://localhost:8080/api`.

#### Docker

1. Build the JAR and stage it for Docker using the `assembleLocal` Gradle task:

```bash
./gradlew :zpwa-api:assembleLocal
```

This compiles the application, produces the Spring Boot JAR, and copies it to `zpwa-docker/src/local/api/stage/api.jar`.

2. Start the Docker container using Docker Compose:

```bash
cd zpwa-docker/src/local
docker compose up --build
```

The container exposes port `8080` for the API and port `5005` for remote debugging.

### API Documentation

Once the application is running, the following documentation endpoints are available:

| Resource | URL |
|---|---|
| OpenAPI Docs | [http://localhost:8080/api/api-docs](http://localhost:8080/api/api-docs) |
| Swagger UI | [http://localhost:8080/api/swagger-ui](http://localhost:8080/api/swagger-ui) |

### Angular Frontend (zpwa-ng)

The `zpwa-ng` directory contains the Angular frontend application, managed with the Yarn package manager.

| Technology | Version |
|---|---|
| Angular | 21.1.4 |
| TypeScript | 5.9.3 |
| Yarn | 4.12.0 |

#### Install Packages

Install all project dependencies:

```bash
cd zpwa-ng
yarn install
```

#### Build

Build the application for production:

```bash
yarn build
```

#### Development Server

Start the development server:

```bash
yarn start
```

The application will be available at `http://localhost:4200`.

### Authentication

The API uses HTTP Basic Authentication. The `/system/**` endpoints are publicly accessible; all other endpoints require authentication.

| Property | Value |
|---|---|
| Username | `zpwa` |
| Password | `zpwa` |
