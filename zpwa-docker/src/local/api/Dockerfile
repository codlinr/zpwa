FROM eclipse-temurin:25-jdk-noble

COPY ./stage/api.jar /zpwa/api.jar

HEALTHCHECK --interval=300s --timeout=2s --retries=3 --start-period=30s --start-interval=5s\
    CMD curl --silent --fail http://localhost:8080/api/system/state || exit 1

#Set container port
EXPOSE 8080