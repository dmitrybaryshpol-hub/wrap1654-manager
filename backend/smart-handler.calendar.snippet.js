/**
 * Smart-handler snippet: Google Calendar sync for orders.
 * Integrates into existing action switch (create_order / update_order / delete_order)
 * without changing Telegram auth or existing ACL checks.
 */

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function parseAllowedInvitees(envValue = "") {
  return new Set(
    String(envValue || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

function safeEmailList(list = [], allowSet = new Set()) {
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x || "").trim().toLowerCase())
    .filter((email, idx, arr) => email && arr.indexOf(email) === idx && allowSet.has(email));
}

function buildGoogleEventPayload(order = {}, invitees = [], tz = "UTC") {
  const carTitle = String(order?.car_model || "").trim() || "Заказ";

  const hasStartDate = Boolean(order?.start_date);
  const hasEndDate = Boolean(order?.end_date);
  const hasStartTime = Boolean(order?.start_time);
  const hasEndTime = Boolean(order?.end_time);

  let start = null;
  let end = null;

  if (hasStartDate && hasStartTime) {
    const startIso = `${order.start_date}T${order.start_time}:00`;
    const endIso = hasEndDate && hasEndTime
      ? `${order.end_date}T${order.end_time}:00`
      : new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();

    start = { dateTime: new Date(startIso).toISOString(), timeZone: tz };
    end = { dateTime: new Date(endIso).toISOString(), timeZone: tz };
  } else if (hasStartDate) {
    const endDate = hasEndDate ? order.end_date : order.start_date;
    const endDateObj = new Date(`${endDate}T00:00:00Z`);
    endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);

    start = { date: order.start_date };
    end = { date: endDateObj.toISOString().slice(0, 10) };
  }

  if (!start || !end) return null;

  return {
    summary: carTitle,
    description: "",
    start,
    end,
    attendees: invitees.map((email) => ({ email })),
  };
}

async function googleCalendarRequest({ method = "GET", calendarId, token, eventId = "", body = null }) {
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = eventId ? `${base}/${encodeURIComponent(eventId)}` : base;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API ${method} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return await res.json();
}

async function syncOrderCalendarEvent({
  supabase,
  order,
  action,
  env,
  invitedEmailsFromFrontend = [],
}) {
  const warningFallback = "Заказ сохранён, но событие в Google Calendar не синхронизировано";

  const calendarId = env.GOOGLE_CALENDAR_ID;
  const googleToken = env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  const allowSet = parseAllowedInvitees(env.ALLOWED_CALENDAR_INVITEES || "");
  const invitees = safeEmailList(invitedEmailsFromFrontend, allowSet);
  const timezone = env.GOOGLE_CALENDAR_TIMEZONE || "UTC";

  if (!calendarId || !googleToken) {
    return { warning: warningFallback };
  }

  try {
    const shouldSync = Boolean(order?.add_to_calendar);
    const existingEventId = String(order?.google_event_id || "").trim();
    const isClosed = String(order?.status || "").toLowerCase() === "closed";

    if (action === "delete") {
      if (existingEventId) {
        await googleCalendarRequest({
          method: "DELETE",
          calendarId,
          token: googleToken,
          eventId: existingEventId,
        });
      }
      return { ok: true };
    }

    if (!shouldSync) {
      if (existingEventId) {
        await googleCalendarRequest({
          method: "DELETE",
          calendarId,
          token: googleToken,
          eventId: existingEventId,
        });

        await supabase
          .from("orders")
          .update({
            google_event_id: null,
            calendar_synced_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
      return { ok: true };
    }

    const payload = buildGoogleEventPayload(order, invitees, timezone);
    if (!payload) return { warning: warningFallback };

    // For CLOSED: do not create new events, only update existing.
    if (isClosed && !existingEventId) {
      return { ok: true };
    }

    if (existingEventId) {
      await googleCalendarRequest({
        method: "PATCH",
        calendarId,
        token: googleToken,
        eventId: existingEventId,
        body: payload,
      });

      await supabase
        .from("orders")
        .update({ calendar_synced_at: new Date().toISOString() })
        .eq("id", order.id);

      return { ok: true, eventId: existingEventId };
    }

    const created = await googleCalendarRequest({
      method: "POST",
      calendarId,
      token: googleToken,
      body: payload,
    });

    await supabase
      .from("orders")
      .update({
        google_event_id: created?.id || null,
        calendar_synced_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return { ok: true, eventId: created?.id || null };
  } catch (error) {
    console.error("Calendar sync failed:", error);
    return { warning: warningFallback };
  }
}

/**
 * Example integration points (inside existing smart-handler action cases)
 *
 * // create_order
 * const { data: createdOrder } = await supabase.from("orders").insert(payload).select("*").single();
 * const calendarRes = await syncOrderCalendarEvent({
 *   supabase,
 *   order: createdOrder,
 *   action: "create",
 *   env: Deno.env.toObject(),
 *   invitedEmailsFromFrontend: body?.invitees,
 * });
 * return json({ ok: true, item: createdOrder, calendar_warning: calendarRes.warning || null });
 *
 * // update_order
 * const { data: updatedOrder } = await supabase.from("orders").update(payload).eq("id", body.id).select("*").single();
 * const calendarRes = await syncOrderCalendarEvent({
 *   supabase,
 *   order: updatedOrder,
 *   action: "update",
 *   env: Deno.env.toObject(),
 *   invitedEmailsFromFrontend: body?.invitees,
 * });
 * return json({ ok: true, item: updatedOrder, calendar_warning: calendarRes.warning || null });
 *
 * // delete_order
 * const { data: orderBeforeDelete } = await supabase.from("orders").select("id, google_event_id").eq("id", body.id).single();
 * await supabase.from("orders").delete().eq("id", body.id);
 * const calendarRes = await syncOrderCalendarEvent({
 *   supabase,
 *   order: orderBeforeDelete,
 *   action: "delete",
 *   env: Deno.env.toObject(),
 * });
 * return json({ ok: true, calendar_warning: calendarRes.warning || null });
 *
 * // get_orders sorting at backend (optional but recommended)
 * // .order("status_rank", { ascending: true }) via CASE NEW/IN_PROGRESS/READY/CLOSED, then created_at desc, id desc.
 */
