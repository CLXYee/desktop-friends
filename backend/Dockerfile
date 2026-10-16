# Desktop Friends backend: built with the Maven Wrapper, run on a small JRE image as a non-root user.
# Tests are run before building images (./mvnw test needs Docker for its Postgres), so they're skipped here.

FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN sh ./mvnw -B -q dependency:go-offline
COPY src src
RUN sh ./mvnw -B -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /workspace/target/desktop-friends-backend.jar app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
