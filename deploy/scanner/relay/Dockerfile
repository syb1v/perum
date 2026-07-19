FROM python:3.12-slim

ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/syb1v/perum" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="PERUM scanner relay"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY perum-core/app/__init__.py /app/app/__init__.py
COPY perum-core/app/scanner_relay.py /app/app/scanner_relay.py

USER 65532:65532
EXPOSE 3310
CMD ["python", "-m", "app.scanner_relay"]
