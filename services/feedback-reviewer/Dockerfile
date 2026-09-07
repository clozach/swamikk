FROM node:22-alpine
WORKDIR /opt/feedback-reviewer
COPY --chown=node:node services/feedback-reviewer/config.mjs services/feedback-reviewer/private-inputs.mjs services/feedback-reviewer/cli.mjs services/feedback-reviewer/protocol.mjs services/feedback-reviewer/transport.mjs services/feedback-reviewer/journal.mjs services/feedback-reviewer/run-once.mjs ./
USER node
ENTRYPOINT ["node", "cli.mjs"]
# No configuration, grant, provider/model, worker loop or default invocation.
