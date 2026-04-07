import http from "node:http";

const PORT = Number(process.env.MOCK_BROKER_SYNC_PORT || 4010);

let nextTradesyncAccountId = 9001;
let nextWebhookId = 7001;

const tradesyncAccounts = [
  {
    id: 9000,
    application: "mt5",
    type: "readonly",
    account_name: "Roman Copier Account",
    account_number: 12345678,
    broker_server_id: 43,
    status: "connection_ok",
    login_response: null,
    client_name: "Yazan",
    server: "MockBroker-Live",
    broker: "Mock Broker"
  }
];

const tradesyncWebhooks = [];

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(payload));
};

const readJson = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const getBasicAuth = (request) => {
  const raw = request.headers.authorization || "";

  if (!raw.startsWith("Basic ")) {
    return null;
  }

  const [key, secret] = Buffer.from(raw.slice(6), "base64").toString("utf8").split(":");
  return { key, secret };
};

const getBearerToken = (request) => {
  const raw = request.headers.authorization || "";
  return raw.startsWith("Bearer ") ? raw.slice(7) : null;
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/__health") {
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname.startsWith("/tradovate/")) {
    const token = getBearerToken(request);

    if (url.pathname.endsWith("/auth/accesstokenrequest") && request.method === "POST") {
      const body = await readJson(request);

      if (body?.name === "demo-user@tradovate" && body?.password === "dedicated-pass" && body?.sec === "tradovate-key") {
        return sendJson(response, 200, {
          accessToken: "tradovate-access-token",
          expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          userId: 401
        });
      }

      return sendJson(response, 401, {
        errorText: "Invalid Tradovate credentials."
      });
    }

    if (url.pathname.endsWith("/auth/me") && request.method === "GET") {
      if (token === "tradovate-key" || token === "tradovate-access-token") {
        return sendJson(response, 200, {
          id: 401,
          name: "demo-user@tradovate"
        });
      }

      return sendJson(response, 401, {
        errorText: "Invalid token."
      });
    }

    if (url.pathname.endsWith("/account/list") && request.method === "GET") {
      if (token === "tradovate-key" || token === "tradovate-access-token") {
        return sendJson(response, 200, [
          {
            id: 884201,
            name: "Roman Capital Primary",
            status: "active"
          }
        ]);
      }

      return sendJson(response, 401, {
        errorText: "Not authorized."
      });
    }
  }

  if (url.pathname.startsWith("/tradesync/")) {
    const auth = getBasicAuth(request);

    if (!auth || auth.key !== "tradesync-key" || auth.secret !== "tradesync-secret") {
      return sendJson(response, 401, {
        result: "error",
        status: 401,
        error: "Invalid API credentials."
      });
    }

    if (url.pathname === "/tradesync/accounts/" && request.method === "GET") {
      return sendJson(response, 200, {
        result: "success",
        status: 200,
        meta: {
          count: tradesyncAccounts.length,
          limit: 1000,
          order: "desc",
          last_id: tradesyncAccounts[tradesyncAccounts.length - 1]?.id ?? null
        },
        data: tradesyncAccounts
      });
    }

    if (url.pathname === "/tradesync/accounts/" && request.method === "POST") {
      const body = await readJson(request);
      const created = {
        id: nextTradesyncAccountId++,
        application: body.application,
        type: body.type,
        account_name: body.account_name,
        account_number: body.account_number,
        broker_server_id: body.broker_server_id,
        status: "connection_ok",
        login_response: null,
        client_name: "Yazan",
        server: "MockBroker-Live",
        broker: "Mock Broker"
      };

      tradesyncAccounts.unshift(created);

      return sendJson(response, 200, {
        result: "success",
        status: 200,
        data: created
      });
    }

    if (/^\/tradesync\/accounts\/\d+\/connection$/.test(url.pathname) && request.method === "PATCH") {
      const accountId = Number(url.pathname.split("/")[3]);
      const body = await readJson(request);
      const account = tradesyncAccounts.find((item) => item.id === accountId);

      if (!account) {
        return sendJson(response, 404, {
          result: "error",
          status: 404,
          error: "Account not found."
        });
      }

      account.broker_server_id = body.broker_server_id;
      account.status = "connection_ok";
      account.login_response = null;

      return sendJson(response, 200, {
        result: "success",
        status: 200,
        data: account
      });
    }

    if (/^\/tradesync\/broker-servers\/\d+$/.test(url.pathname) && request.method === "GET") {
      const brokerServerId = Number(url.pathname.split("/")[3]);

      return sendJson(response, 200, {
        result: "success",
        status: 200,
        data: {
          id: brokerServerId,
          application: "mt5",
          name: "MockBroker-Live"
        }
      });
    }

    if (url.pathname === "/tradesync/webhooks/" && request.method === "GET") {
      return sendJson(response, 200, {
        result: "success",
        status: 200,
        meta: {
          count: tradesyncWebhooks.length,
          limit: 1000,
          order: "desc",
          last_id: tradesyncWebhooks[tradesyncWebhooks.length - 1]?.id ?? null
        },
        data: tradesyncWebhooks
      });
    }

    if (url.pathname === "/tradesync/webhooks/" && request.method === "POST") {
      const body = await readJson(request);
      const created = {
        id: nextWebhookId++,
        ...body
      };

      tradesyncWebhooks.unshift(created);

      return sendJson(response, 200, {
        result: "success",
        status: 200,
        data: created
      });
    }

    if (/^\/tradesync\/webhooks\/\d+$/.test(url.pathname) && request.method === "PATCH") {
      const webhookId = Number(url.pathname.split("/")[3]);
      const body = await readJson(request);
      const webhook = tradesyncWebhooks.find((item) => item.id === webhookId);

      if (!webhook) {
        return sendJson(response, 404, {
          result: "error",
          status: 404,
          error: "Webhook not found."
        });
      }

      Object.assign(webhook, body);

      return sendJson(response, 200, {
        result: "success",
        status: 200,
        data: webhook
      });
    }
  }

  sendJson(response, 404, {
    error: "Not found"
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-broker-sync] listening on http://127.0.0.1:${PORT}`);
});
