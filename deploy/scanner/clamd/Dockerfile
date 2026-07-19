FROM debian:12-slim

ARG VCS_REF
LABEL org.opencontainers.image.source="https://github.com/syb1v/perum" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="PERUM ClamAV daemon and updater"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates clamav clamav-daemon clamav-freshclam \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/clamav \
    && touch /var/lib/clamav/.volume-owner \
    && chown -R clamav:clamav /var/lib/clamav

COPY deploy/scanner/clamd/clamd.conf /etc/clamav/clamd.conf
COPY deploy/scanner/clamd/freshclam.conf /etc/clamav/freshclam.conf

USER clamav:clamav
EXPOSE 3310
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD clamdscan --ping 1
CMD ["clamd", "--foreground=true", "--config-file=/etc/clamav/clamd.conf"]
