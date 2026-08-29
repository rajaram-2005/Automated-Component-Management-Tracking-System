# ---- Build stage ----------------------------------------------------------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

# Cache dependencies first for faster incremental builds.
COPY pom.xml .
RUN mvn -B -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests clean package

# ---- Runtime stage --------------------------------------------------------
FROM eclipse-temurin:17-jre
WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=build /workspace/target/*.jar app.jar

EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
