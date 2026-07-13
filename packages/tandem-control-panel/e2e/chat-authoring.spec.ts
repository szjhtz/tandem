import { expect, test, waitForRoute } from "./fixtures/api";

test("setup guidance stays advisory and product authoring reaches the model", async ({
  page,
  apiFixture,
}) => {
  const prompt = "Create an automation that summarizes support tickets every morning";
  apiFixture.mockResponse(
    "/api/engine/setup/understand",
    {
      decision: "intercept",
      intent_kind: "automation_create",
      clarifier: null,
      slots: {
        provider_ids: [],
        model_ids: [],
        integration_targets: [],
        channel_targets: [],
        goal: prompt,
      },
      proposed_action: {
        type: "automation_create",
        payload: { prompt },
      },
    },
    "POST"
  );
  apiFixture.mockResponse("/api/engine/session", { id: "chat-authoring-session" }, "POST");
  const modelRequest = apiFixture.holdNext(
    "/api/engine/session/chat-authoring-session/prompt_async",
    "POST"
  );

  await page.goto("/#/chat");
  await waitForRoute(page, "chat");
  const composer = page.getByPlaceholder(
    "Ask anything... (Enter to send, Shift+Enter newline)"
  );
  await composer.fill(prompt);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await modelRequest.waitUntilRequested();
  await expect(page.getByText("Automation setup", { exact: true })).toBeVisible();
  await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible();
  await expect(composer).toHaveValue("");
  expect(apiFixture.requests).toContain("POST /api/engine/setup/understand");
  expect(apiFixture.requests).toContain(
    "POST /api/engine/session/chat-authoring-session/prompt_async?return=run"
  );

  modelRequest.release();
});
