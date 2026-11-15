# WhatsApp Sales Agent research (Twilio, Urdu voice, LangGraph) - as of 2026-11-15

Confidence tags: [DOC] read on an official vendor page this session; [SEC] secondary/blog/vendor-marketing; [?] unconfirmed / from memory.

## Track A - Twilio WhatsApp

### A1. Sandbox vs production sender, onboarding many sellers
- Sandbox: shared number +14155238886; each tester sends `join <code>`; session expires 72h after joining (rejoin); only joined users can be messaged (error 63015); 1 msg per 3 s; functional testing only, not load; business-initiated only with 3 pre-approved templates (Appointment Reminders, Order Notifications, Verification Codes); custom templates need a registered sender; 100 free WhatsApp msgs on trial. [DOC] https://www.twilio.com/docs/whatsapp/sandbox
- Production sender: upgraded (paid) Twilio account + admin access to a Meta Business Portfolio (can be created during sign-up) + a phone number not already on WhatsApp that can receive SMS/voice OTP. Console > Messaging > Senders > WhatsApp senders > Create new sender > "Continue with Facebook" (Self Sign-up). Creates a WABA + business profile. Registration itself takes minutes. [DOC] https://www.twilio.com/docs/whatsapp/self-sign-up
- Display name reviewed by Meta; if rejected, limited to 250 business-initiated msgs/24h and may be disconnected. Don't pick "display name only" option. [DOC] same page.
- Meta Business Verification is required before "production" (higher limits, >2 senders). Twilio's own doc says "several weeks depending on region"; an older Twilio help article says 5-20 business days; BSP blogs claim 1-3 days. No Pakistan-specific document list found. [DOC]+[SEC] https://www.twilio.com/docs/whatsapp/self-sign-up ; https://support.twilio.com/hc/en-us/articles/6686317584155-WhatsApp-Self-Sign-Up-Guide
- Realistic demo to examiners: use the Sandbox (join code, re-join before demo day because of 72h expiry) - voice notes, webhooks, templates-free flows all work. Production number is optional "future work" unless the team already has a verified business. (inference)
- Multi-seller onboarding options:
  1. Seller owns a normal Twilio account + does Self Sign-up themselves in Twilio Console; they give the platform credentials; platform sets the webhook. Matches the "seller owns billing" decision. No ISV program needed. (inference from docs)
  2. Twilio Tech Provider program for ISVs: platform creates + gets Meta app approved, accepts Twilio "Partner Solution" link, integrates Meta Embedded Signup, registers senders via the Senders API using the customer's (sub)account credentials. Up to 200 new customers per rolling 7 days after business verification/App Review/Access Verification. Free to join. Setup "3-4 weeks" for approval, 3-8 weeks total on one page. Docs do not say whether sellers can bring their own pre-existing Twilio account; the docs describe subaccount credentials assigned to the customer. [DOC] https://www.twilio.com/docs/whatsapp/isv/tech-provider-program ; [SEC-via search] FAQ https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq
  3. For this FYP: option 1 (seller pastes Account SID + credentials) is the only realistic one. Tech Provider is out of scope timewise.
- Credentials caveat: Twilio signature validation uses the account Auth Token (the signature covers "your auth token, the webhook URL, and the request parameters"). Media download and REST sends can use an API Key + Secret instead. So per tenant you realistically need Account SID + Auth Token (for validation); an API key pair is optional for sends/media. Encrypt at rest. [DOC] https://www.twilio.com/docs/usage/webhooks/webhooks-security ; https://www.twilio.com/docs/api/messaging/media (basic-auth statement via search)

### A2. Inbound webhook
- Content-Type `application/x-www-form-urlencoded`, POST (or GET). [DOC] https://www.twilio.com/docs/messaging/guides/webhook-request
- Params: MessageSid, SmsSid/SmsMessageSid (deprecated), AccountSid, MessagingServiceSid, From (`whatsapp:+92...`), To, Body (<=1600 chars), NumMedia, NumSegments, MediaContentType{N}, MediaUrl{N} (zero-based), ButtonPayload, ButtonText, ButtonType (REPLY/ACTION), InteractiveData (JSON), FlowData, ChannelMetadata (JSON), Latitude, Longitude, Address, Label, ProfileName, WaId, Forwarded, FrequentlyForwarded, ReferralBody/Headline/SourceId/SourceType/SourceUrl/MediaId/MediaContentType/MediaUrl/NumMedia/CtwaClid (click-to-WhatsApp ads), OriginalRepliedMessageSender/Sid (replies within 7 days). Twilio says params may be added without notice - tolerate unknown fields. [DOC] same URL.
- Signature: header `X-Twilio-Signature` = HMAC-SHA1 over exact URL + alphabetically sorted POST params, keyed with Auth Token. Use SDK (`twilio.validateRequest` / `validateExpressRequest`). Use the exact URL configured in Twilio incl. query string, don't decode/re-encode, pass ALL form params, omit URL fragment. For JSON bodies a `bodySHA256` query param is added. [DOC] https://www.twilio.com/docs/usage/webhooks/webhooks-security ; fragment note https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides
- Proxy/Render gotcha: Twilio docs give no proxy guidance; because URL must match exactly, behind a TLS-terminating proxy `req.protocol`/`req.host` can differ (http vs https, internal host). Build the validation URL from a configured public base URL (per tenant) rather than from the request; or set `trust proxy` and verify. [inference from DOC]
- Timeout/retry: default connect timeout 5000 ms, read timeout 15000 ms, total 15000 ms, retry count 1, retry policy `ct` (connection failures only). Overrides go in URL fragment e.g. `#rc=0&rt=...`. Not available for Conversations/Frontline. Hard 15 s cap. So respond within seconds. [DOC] https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides . Retries carry `I-Twilio-Idempotency-Token`. [DOC, mentioned briefly]
- Idempotency: dedupe on `MessageSid` (unique index per tenant). Retries only on connect failures by default, but dedupe anyway. (inference)
- Pattern: ack with HTTP 200 + empty `<Response></Response>` TwiML (no reply is sent) then process async and send via REST API. [DOC] https://www.twilio.com/docs/usage/webhooks/messaging-webhooks . Persist the inbound row first, enqueue, return 200.

### A3. Media download
- Media URLs require HTTP Basic auth (Account SID + Auth Token, or API Key SID + Secret). Media persists until you delete the Media subresource; Twilio's docs don't state an automatic retention period I could find. [SEC-via search of official page] https://www.twilio.com/docs/api/messaging/media ; https://www.twilio.com/docs/messaging/api/media-resource
- Inbound: images (JPG/PNG), audio, PDF; 16 MB per message. [DOC] https://www.twilio.com/docs/whatsapp/api
- Voice-note MIME on inbound not documented by Twilio; expect `audio/ogg` (Opus), possibly with `; codecs=opus`. Match on prefix `audio/`, log the real value. [?] (Bird docs show `audio/ogg; codecs=opus` https://bird.com/docs/guides/whatsapp/receiving-whatsapp/audio)
- Downloads may redirect; follow redirects but strip auth on cross-host redirect (fetch libraries differ). [?]

### A4. Outbound
- 24 h customer service window opens/refreshes on each inbound user message; inside = freeform; outside = approved template only (error 63016 otherwise). [DOC] https://www.twilio.com/docs/whatsapp/api ; https://www.twilio.com/docs/api/errors/63016
- Templates via Content Template Builder / Content API (`ContentSid` `HX...` + `ContentVariables`); need a Messaging Service; names lowercase/digits/underscore; can't edit after submit (create new); WhatsApp reviews "within minutes" typically; categories Marketing/Utility/Authentication (Meta definitions); can be paused (3 h, 6 h, then permanently deactivated) on negative feedback; error codes 63040/63041/63042/63046. [DOC] https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates
- Interactive content types (Content API) [DOC] https://www.twilio.com/docs/content/content-types-overview : in-session without approval: twilio/media, quick-reply, list-picker, catalog, location, pay; card and call-to-action depend on button types; carousel and flows need approval. Button title 25 chars on WhatsApp; id (payload) 128 chars. list-picker and location cannot start business-initiated chats. Max buttons/list items not stated there (WhatsApp: 3 quick replies, 10 list rows - from memory [?]).
- Inbound taps arrive as ButtonPayload / ButtonText / InteractiveData.
- Media out: images JPG/PNG (WEBP for stickers); audio OGG (only with opus codec; .ogg or .opus), AMR, 3GP, AAC, MPEG; docs PDF/DOC(X)/PPTX/XLSX; video MP4 H.264+AAC; total message 20 MB, images 5 MB; Twilio checks MediaUrl `Content-Type` header matches the file (serve with correct header). [DOC] https://www.twilio.com/docs/whatsapp/guidance-whatsapp-media-messages
- Voice-note rendering: Twilio support article says OGG/opus can be sent as a voice note. Meta says voice messages need Ogg+Opus, mono. MP3/M4A will show as plain audio file. Not confirmed for Twilio via a test. [SEC] https://support.twilio.com/hc/en-us/articles/360017961894 (403 on fetch; text seen in search snippet) ; https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages
- Outbound media must be fetchable at a public URL (MediaUrl), so TTS audio needs to be hosted (Supabase Storage signed/public URL, short-lived). [DOC implied]
- Typing indicator + read receipt: `POST https://messaging.twilio.com/v3/Indicators/Typing.json`, JSON body `{"messageId":"SM...","channel":"whatsapp"}`, Basic auth with API Key SID/secret; also marks inbound message as read; clears on delivery or after 25 s (re-send to extend). PUBLIC BETA (no SLA). [DOC] https://www.twilio.com/docs/whatsapp/api/typing-indicators-resource ; changelog https://www.twilio.com/en-us/changelog/v3-typing-indicator-api . Good for voice-note latency UX.

### A5. Status callbacks / errors
- Pass `StatusCallback` per message (or Messaging Service-level). Form-encoded POST; `MessageStatus`, `ErrorCode` on failed/undelivered; WhatsApp adds ChannelStatusMessage; `EventType=READ` for read receipts; ordering NOT guaranteed - never assume sequence; validate signature. Statuses: queued, sent, delivered, read, failed, undelivered. [DOC] https://www.twilio.com/docs/messaging/guides/track-outbound-message-status
- Codes worth handling: 63016 (outside 24 h window -> need template), 63015 (sandbox recipient not joined), 63018 (WhatsApp rate limit), 63040/63041/63042/63046 (template rejected/paused/disabled/approved-alert), 63024 invalid recipient, 63032 (WhatsApp policy block) - last three from memory [?]. 63016/63015/6304x [DOC]. https://www.twilio.com/docs/api/errors/63018 (via search). The WhatsApp error-code page URL I tried 404'd.

### A6. Pricing (Pakistan) - USD, dates matter
- Twilio fee: $0.005 per WhatsApp message, inbound AND outbound; failed +$0.001; Meta fees passed through. [DOC] https://www.twilio.com/en-us/whatsapp/pricing
- Meta model since 2025-07-01: per-delivered-template-message pricing, user->business free, free-form "service" messages in the 24 h window were free. Meta's own page now says: each business phone number gets 1,000 free service messages/month; from 2026-10-01 service messages beyond that are CHARGED; Pakistan utility/authentication rates rise 2026-10-01. [DOC] https://developers.facebook.com/docs/whatsapp/pricing (no PK numbers on the page; rate card is CSV/PDF I could not open).
- PK numbers (secondary, effective 2026-10-01): Marketing $0.0473; Utility $0.015; Authentication domestic $0.015 (international $0.075); Service $0.015. [SEC] https://propakistani.pk/2026/09/15/meta-charges-pakistan-11x-more-than-india-for-whatsapp-business-messages/ ; Gupshup changelog Utility/Auth $0.01 -> $0.015 https://partner-docs.gupshup.io/changelog/october-2026 . Conflict: Gallabox lists utility/auth $0.0172, marketing $0.0544 https://docs.gallabox.com/pricing-and-billing/whatsapp-pricing/rate-card.md . Treat $0.015-0.0172 as the range; verify against Meta's PK rate card.
- Verification message check: utility/auth template = ~$0.015 Meta + $0.005 Twilio = ~$0.02 (~Rs 5.5-6 at ~Rs 280/USD; FX is my assumption). **The "~Rs 3" assumption does NOT hold** after Oct 2026 (it was roughly right pre-Oct: $0.01+$0.005 = $0.015 = ~Rs 4.2, still above). Budget Rs 6 per verification template, Rs ~1.5 Twilio fee per each inbound/outbound free-form message, plus Meta service-message charge ~$0.015 after the first 1,000/month per number (if the PK service rate is as reported).
- Rough cost of a text-only chat turn (1 inbound + 1 reply): Twilio $0.01 (~Rs 2.8) + (after free tier) Meta service $0.015 on the reply -> up to ~$0.025 (~Rs 7). Messaging cost will dominate AI cost. (derived)
- Sellers pay all this on their own account - disclose it in the product.

### A7. Limits
- Throughput: 80 MPS default per sender for text or media (older 50/1.5 MPS pages outdated); text can be raised to 400 MPS on request; excess queued, fails after 4 h. [SEC] https://www.twilio.com/en-us/changelog/80-mps-default-throughput-upgrade-for-twilio-whatsapp-text-and-media ; https://www.twilio.com/docs/whatsapp/best-practices-and-faqs
- Messaging limits (unique users per rolling 24 h, business-initiated) are per business portfolio; new portfolios start low (commonly 250 unverified); verification unlocks more; Meta scales up with quality. Not relevant to user-initiated chats inside the window. Tier numbers 1K/10K/100K: not confirmed from official source. [SEC/?]
- Sandbox: 1 msg / 3 s.

## Track B - Voice notes

### B1. STT comparison (Urdu)
| Provider/model | Urdu | Accepts ogg/opus | Price | Output script / steering | Evidence |
|---|---|---|---|---|---|
| Google Gemini (audio input; 3.5 Flash-Lite, 3.1 Flash-Lite, 3 Flash) | Not named in docs; strongest published code-switched Urdu result (Gemini 2.5 Pro WER ~0.02-0.03 vs Whisper-large-v3 0.29/0.53, with a prompt) | Yes `audio/ogg`, also opus/wav/mp3/flac/webm; 20 MB inline, Files API above | 32 tokens/s = 1,920 tok/min; audio in $0.30/M (3.5 Flash-Lite) = ~$0.0006/min; 3.1 Flash-Lite $0.50/M; 3 Flash Preview $1.00/M | Fully promptable (Urdu script / Roman / keep English words / emit JSON with intent) | [DOC] https://aistudio.google.com/docs/audio ; https://aistudio.google.com/docs/pricing ; [SEC] https://arxiv.org/pdf/2605.17846 |
| OpenAI `gpt-transcribe` (new) | Urdu not confirmed on docs page; supports multiple `languages` hints, code-switching claimed, keywords/prompt | ogg accepted (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm), 25 MB | $0.0045/min | prompt + keywords | [DOC] https://developers.openai.com/api/docs/guides/speech-to-text ; https://developers.openai.com/api/docs/models/gpt-transcribe |
| OpenAI whisper-1 / gpt-4o-(mini-)transcribe | Whisper's 98 langs incl. Urdu, quality varies; Whisper-large-v3 poor on code-switched Urdu (transliterates English) | same | $0.006 / $0.006 / $0.003 per min | prompt (224 tokens whisper-1) | DEPRECATED, shut down 2027-02-26 [DOC] same guide |
| Deepgram Nova-3 `ur` | Yes (added Feb 2026, improved Aug 2026), monolingual only, keyterm prompting, batch + streaming; no code-switching for Urdu mentioned | Yes (Deepgram decodes common containers) [?] | per-hour price not retrieved (credits $200 signup) | Nastaliq; Roman not addressed | [DOC] https://deepgram.com/blog/speech-to-text-for-hebrew-persian-urdu-on-nova-3 ; https://developers.deepgram.com/changelog/2026/8/17 |
| ElevenLabs Scribe v2 | Urdu in "Moderate" tier (WER >25% up to 50%) per ElevenLabs's own table; ElevenLabs marketing gave 14.4% FLEURS Urdu for v1 | ogg, opus, mp3, wav, m4a, webm etc; up to 5 GB | ~$0.22-0.40/h (secondary), keyterms extra | auto language ID; keyterms | [DOC] https://elevenlabs.io/docs/overview/capabilities/speech-to-text ; [SEC] https://soniox.com/compare-stt/soniox-vs-elevenlabs/urdu |
| Google Cloud STT v2 (chirp_2 asia-southeast1/europe-west4, chirp_3 us/eu) | `ur-PK` yes | needs supported encoding; OGG_OPUS supported in v2 [?] | not retrieved | Nastaliq | [DOC] https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages |
| Azure Speech | `ur-IN` confirmed for STT; `ur-PK` STT/TTS (AsadNeural, UzmaNeural) could not be confirmed from the truncated page | needs GStreamer/conversion for opus in some SDK paths [?] | not retrieved | Nastaliq | [DOC-partial] https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support |
| Uplift AI Scribe (Pakistani) | Urdu only (`ur`); `phone-commerce` domain hint exists; code-mixed not documented | not documented | credits: scribe 40/min, scribe-mini 20/min; USD price not published | Urdu | [DOC] https://docs.pipecat.ai/api-reference/server/services/stt/upliftai ; pricing: contact founders@upliftai.org |
| Soniox | Urdu + mid-sentence code-switching claimed | [?] | $0.10/h async, $0.12/h realtime (vendor) | - | [SEC vendor claims; WER numbers contradict each other] https://soniox.com/speech-to-text/urdu |
| Open models (Whisper-large-v3 fine-tunes, Meta OmniASR/MMS/Seamless) | Fine-tunes exist (e.g. BuzzASR/urdu on HF); OmniASR-LLM-1B tested in UrduSpeech paper | need ffmpeg | self-host GPU | - | not worth it for FYP |

Notes:
- No independent head-to-head of OpenAI/Deepgram/ElevenLabs/Gemini on Urdu + Roman Urdu code-mixed exists in what I found. Best evidence: UrduSpeech corpus paper (Gemini >> Whisper-large-v3 on code-switched) https://arxiv.org/pdf/2605.17846 ; "WER We Stand" (older, Whisper good on conversational Urdu) https://arxiv.org/pdf/2409.11252 ; code-switching benchmark where gpt-4o-transcribe degrades (Arabic/Persian/German, not Urdu) https://arxiv.org/pdf/2605.19069 . All vendor WER numbers (Soniox, ElevenLabs) are marketing.
- "Roman Urdu" voice: people speak Urdu; script is a transcription choice. Most STT returns Nastaliq. For an LLM agent either is fine; keep the transcript in whatever the STT returns, store original audio URL + transcript. Only prompt-driven models (Gemini, gpt-transcribe prompt) can be steered toward Roman output. Typed Roman Urdu is handled by the agent LLM, no STT.

### B2. Skip STT: audio straight into a multimodal LLM
- Gemini accepts audio inline (ogg OK, 20 MB). One call can transcribe + extract intent/entities (JSON) cheaply (~$0.0006/min audio at 3.5 Flash-Lite). OpenAI's realtime / gpt-realtime-2.1(-mini) audio models are token-priced ($10-32 in / $20-64 out per M) - far costlier and aimed at live voice. [DOC] https://developers.openai.com/api/docs/pricing
- Tradeoffs: (+) fewer hops, handles code-mixing/prosody, promptable; (-) you lose a clean auditable transcript unless you ask for it explicitly (do: have the model return `{transcript, language, intent}`), LangGraph tool-calling is simplest with a text pipeline, model-specific lock-in, hallucination risk on noisy audio - for order details (address, phone, quantity) always read back and confirm.
- Recommended hybrid: use Gemini as the transcriber ("STT via LLM") returning transcript text, then feed text to the LangGraph agent whatever model it uses.

### B3. TTS for Urdu voice replies
| Provider | Urdu | Formats | Price | Notes |
|---|---|---|---|---|
| OpenAI tts-1/tts-1-hd/gpt-4o-mini-tts | Urdu listed (Whisper language set), voices English-optimised; `instructions` for style | mp3, opus, aac, flac, wav, pcm | tts-1 $15/M chars; mini-tts audio $12/M tokens | DEPRECATED, shut down 2027-01-06 (replacement via Realtime API only) [DOC] https://developers.openai.com/api/docs/guides/text-to-speech - don't build on it |
| ElevenLabs Eleven v3 | Urdu `ur` yes (70+ langs, 5,000 char limit); Flash v2.5 (32 langs, Urdu not listed) | `opus_48000_32..192`, mp3, pcm, wav, ulaw_8000; | credits-based; not retrieved | [DOC] https://elevenlabs.io/docs/overview/models ; https://elevenlabs.io/docs/api-reference/text-to-speech/convert ; whether `opus_48000_*` is an Ogg container (WhatsApp needs Ogg/Opus) not confirmed [?] - test |
| Uplift AI Orator | Urdu-first, native voices, WS streaming ~150-200 ms | `outputFormat` e.g. `MP3_22050_128`; full list/ogg not confirmed | not published (contact) | [DOC] https://docs.upliftai.org (landing page) - best-sounding Pakistani Urdu likely; need account to confirm |
| Google Gemini TTS (3.8 Flash TTS, Flash-Lite TTS) | Urdu NOT in the supported language table (Hindi is) | WAV/PCM 24 kHz mono, mulaw/alaw | $9/M audio tokens (to 2026-12-31 then $18), 25 tok/s | [DOC] https://aistudio.google.com/docs/speech-generation |
| Google Cloud TTS / Azure | Azure ur-PK voices Asad/Uzma Neural (partial confirmation) | Azure supports ogg-24khz-16bit-mono-opus [?] | not retrieved | Azure is the one major cloud with direct Ogg/Opus output [?] |
| Soniox TTS | Urdu claimed, $0.70/h generated (vendor) | ? | - | [SEC] https://soniox.com/text-to-speech/urdu |

- Any TTS output -> transcode with ffmpeg to mono Ogg/Opus (`ffmpeg -i in.wav -c:a libopus -b:a 32k -ac 1 -ar 48000 out.ogg`) so WhatsApp renders it as a voice note. Host at public URL with `Content-Type: audio/ogg`.
- TTS of "Roman Urdu" text sounds wrong; always generate Urdu-script text for TTS (have the agent produce a separate `spoken_reply` in Urdu script).

### B4. Recommended pipeline
Twilio POST -> verify signature -> insert inbound (dedupe MessageSid) -> 200 empty TwiML -> (async worker) fire typing indicator -> download MediaUrl0 with Basic auth (~0.3-0.8 s) -> (no transcode needed for Gemini/ElevenLabs/OpenAI/Deepgram; they accept ogg) -> STT/Gemini (~1-3 s for a 10-30 s note) -> POST to apps/ml FastAPI (LangGraph, 2-6 s with tool calls) -> reply text via Twilio REST (~0.5 s). Optional voice reply: TTS (1-3 s) + ffmpeg to ogg/opus (0.2-0.5 s) + upload + send. Estimated end-to-end: text reply ~5-10 s; voice reply ~8-15 s. [estimates, not measured]
Cost per voice-note turn (30 s note, 1 reply, USD): STT ~$0.0003 (Gemini 3.5 Flash-Lite) to $0.0023 (gpt-transcribe); LLM ~ $0.001-0.01 (depends on model, unmeasured); Twilio $0.01 (in+out); Meta service message $0.015 after 1,000 free/month/number; TTS ~ $0.005-0.02 (est.). => ~$0.03-0.05 (~Rs 8-14) with voice reply, messaging fees being >70%.
- PRIMARY: Gemini Flash-class audio -> transcript (+ detected language) ; text reply by default; voice reply only when the buyer sent voice AND seller enabled it.
- FALLBACK STT: ElevenLabs Scribe v2 (best documented code-switching in third-party bench, auto language ID) or Deepgram Nova-3 `ur` (cheap, fast, Nastaliq). Or OpenAI `gpt-transcribe` (don't use whisper-1/4o-transcribe: deprecated 2027-02-26).
- TTS PRIMARY: Uplift Orator (if API access/price OK) else ElevenLabs Eleven v3; fallback = text reply. Skip OpenAI TTS (deprecated 2027-01-06) and Gemini TTS (no Urdu).
- Do a 1-hour bake-off on ~30 real Pakistani voice notes (Urdu, Roman-style code-mix with English product names, noisy) before committing; compare transcript accuracy of product names, numbers, addresses.

## Track C - LangGraph Python fit
- Versions (PyPI, 2026-11-15): `langgraph` 1.2.22 (py>=3.10; classifiers 3.10-3.13) ; `langgraph-checkpoint-postgres` 3.2.1 released 2026-11-14 (py>=3.10; needs psycopg>=3.2, psycopg-pool, langgraph-checkpoint>=4.3,<5, orjson). [DOC] https://pypi.org/pypi/langgraph/json ; https://pypi.org/pypi/langgraph-checkpoint-postgres/json
- Checkpointer: `PostgresSaver` / `AsyncPostgresSaver` (separate package), call `.setup()` once (migrations) ; compile with `builder.compile(checkpointer=...)` ; run with `config={"configurable":{"thread_id": ...}}` keep thread_id <255 chars. Suggested thread_id: `{tenant_id}:{customer_wa_id}` (or conversation uuid). Checkpoints accumulate: add retention job. [DOC] https://docs.langchain.com/oss/python/langgraph/persistence ; https://docs.langchain.com/oss/python/langgraph/checkpointers
- Supabase: pooled transaction-mode connections (port 6543) do not support prepared statements; psycopg needs `prepare_threshold=None`; use direct connection or session-mode pooler for the checkpointer to be safe. Reported: `from_conn_string` hardcodes prepare_threshold=0 so build your own `AsyncConnectionPool` (autocommit=True, row_factory=dict_row, prepare_threshold=None) [SEC blog - verify] https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL ; https://particula.tech/blog/langgraph-checkpointer-postgres-production
- Human handoff: `interrupt(payload)` in a node pauses, state saved by checkpointer, returned under `__interrupt__`; resume with `graph.invoke(Command(resume=value), config)` same thread_id. Rules: node re-runs from the top on resume (idempotent code before interrupt), no bare try/except around it, stable call order, JSON-serializable payload. [DOC] https://docs.langchain.com/oss/python/langgraph/interrupts
  Design note: for a seller taking over a chat that may stay open for hours/days, simpler than interrupt: set `handoff=true` flag on conversation in DB and have the webhook skip the agent; use `interrupt()` for approvals (e.g. "confirm draft order?") where the same graph run resumes. (design suggestion)
- FastAPI: compile graph once at startup (lifespan), hold the saver/pool on app state, expose `POST /agent/turn {tenant_id, thread_id, message, media_transcript}` -> `await graph.ainvoke(...)`; use async nodes and `httpx.AsyncClient` for Node tool calls (pass tenant id + internal service token). I did not fetch an official LangGraph-behind-FastAPI page; it's standard ASGI usage. [?]
- Tools calling HTTP: plain `@tool` async functions using httpx to Node internal endpoints; keep tenant_id injected from graph config, never from the model.

## Recommendations (summary)
1. Demo on Twilio Sandbox; production sender = seller self sign-up on their own Twilio account; skip Tech Provider.
2. Webhook: validate signature using a configured public URL + tenant's Auth Token; dedupe by MessageSid; ack 200 empty TwiML in <1 s; process async; call typing-indicator beta.
3. STT: Gemini Flash-class (prompted transcript, ogg direct); fallback ElevenLabs Scribe v2 / Deepgram Nova-3 ur / OpenAI gpt-transcribe. Bake-off first.
4. Replies text by default; optional voice via Uplift Orator or ElevenLabs v3 -> ffmpeg to mono Ogg/Opus.
5. Re-budget: verification template ~Rs 6 not Rs 3; every chat message costs Twilio Rs ~1.4 each way plus Meta service fee beyond 1,000/month/number.
6. LangGraph: AsyncPostgresSaver on a direct/session Supabase connection, thread_id = tenant:customer.

## Gotchas
- Sandbox 72 h expiry and shared number; join code per account.
- Signature URL mismatch behind proxy/Render (http vs https, host header); never re-encode URL; pass all params; fragment excluded.
- Signature needs Auth Token (not API key); store per tenant encrypted.
- MediaUrl needs Basic auth; MediaContentType may include `; codecs=opus` - prefix match.
- Outbound media URL must be public and served with matching Content-Type; Twilio rejects mismatches. Non-opus OGG rejected.
- 24 h window resets only on inbound; handoff followups after 24 h need templates; list-picker/location can't be business-initiated.
- Status callbacks arrive out of order.
- Typing indicator is public beta, V3 endpoint (older docs mention v2).
- OpenAI whisper-1/gpt-4o-transcribe shut down 2027-02-26; OpenAI TTS 2027-01-06 - don't build on them (course project may outlive them).
- Gemini 2.5 Flash deprecated, routes to 3.5 Flash-Lite 2026-12-01; Gemini 3.8 Flash prices double 2027-01-01; pin model names in config.
- Whisper-family transliterates/translates English words in code-mixed Urdu.
- Supabase pooler + psycopg prepared statements.
- Voice-note transcripts: always read back addresses/phone numbers/quantities.
- Meta 1,000 free service messages are per business phone number/month; from 2026-10-01 charged beyond.

## Unconfirmed
- Exact Meta PK rate card values (sources conflict: $0.015 vs $0.0172 utility; marketing $0.0473 vs $0.0544); exact Twilio-bundled billing of service messages.
- FX rate (~Rs 280/USD assumed).
- Inbound voice note MediaContentType string; Twilio media retention period; whether Twilio renders OGG/opus as voice note in all cases (docs say yes) - needs test.
- Whether Twilio Tech Provider allows a seller's pre-existing Twilio account.
- Senders API specifics (webhook configuration via `callback_url` on Senders API v2) - from memory; verify at https://www.twilio.com/docs/whatsapp/api/senders-resource.
- Meta Business Verification time for Pakistani businesses and the accepted PK documents.
- OpenAI `gpt-transcribe` Urdu support/quality; Deepgram Urdu price and WER; Uplift Scribe/Orator pricing, input/output formats, code-mixed support; Azure ur-PK rows; Google STT price.
- Whether ElevenLabs `opus_48000_*` is Ogg-wrapped.
- Twilio error codes 63024/63032 meanings (from memory); WhatsApp max 3 quick-reply buttons / 10 list rows (from memory).
- Messaging tier numbers (250/1K/10K/100K) from an official source.
- Latency numbers in B4 are estimates, not measured.

## Sources
- https://www.twilio.com/docs/whatsapp/sandbox
- https://www.twilio.com/docs/whatsapp/self-sign-up
- https://www.twilio.com/docs/whatsapp/isv/tech-provider-program (+ /faq, /integration-guide)
- https://www.twilio.com/docs/messaging/guides/webhook-request
- https://www.twilio.com/docs/usage/webhooks/webhooks-security
- https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides
- https://www.twilio.com/docs/usage/webhooks/messaging-webhooks
- https://www.twilio.com/docs/whatsapp/api
- https://www.twilio.com/docs/whatsapp/guidance-whatsapp-media-messages
- https://www.twilio.com/docs/messaging/api/media-resource
- https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates
- https://www.twilio.com/docs/content/content-types-overview
- https://www.twilio.com/docs/api/errors/63016
- https://www.twilio.com/docs/messaging/guides/track-outbound-message-status
- https://www.twilio.com/docs/whatsapp/api/typing-indicators-resource
- https://www.twilio.com/en-us/whatsapp/pricing
- https://www.twilio.com/en-us/changelog/80-mps-default-throughput-upgrade-for-twilio-whatsapp-text-and-media
- https://support.twilio.com/hc/en-us/articles/360017961894 ; https://support.twilio.com/hc/en-us/articles/6686317584155
- https://developers.facebook.com/docs/whatsapp/pricing ; https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages
- https://propakistani.pk/2026/09/15/meta-charges-pakistan-11x-more-than-india-for-whatsapp-business-messages/
- https://partner-docs.gupshup.io/changelog/october-2026 ; https://docs.gallabox.com/pricing-and-billing/whatsapp-pricing/rate-card.md
- https://developers.openai.com/api/docs/guides/speech-to-text ; /guides/text-to-speech ; /pricing ; /models/gpt-transcribe
- https://aistudio.google.com/docs/audio ; /pricing ; /speech-generation
- https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages
- https://deepgram.com/blog/speech-to-text-for-hebrew-persian-urdu-on-nova-3 ; https://developers.deepgram.com/changelog/2026/8/17
- https://elevenlabs.io/docs/overview/capabilities/speech-to-text ; /overview/models ; /api-reference/text-to-speech/convert
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
- https://docs.upliftai.org ; https://docs.pipecat.ai/api-reference/server/services/stt/upliftai
- https://soniox.com/speech-to-text/urdu ; https://soniox.com/compare-stt/soniox-vs-elevenlabs/urdu
- https://arxiv.org/pdf/2605.17846 ; https://arxiv.org/pdf/2409.11252 ; https://arxiv.org/pdf/2605.19069
- https://docs.langchain.com/oss/python/langgraph/interrupts ; /persistence ; /checkpointers
- https://pypi.org/pypi/langgraph/json ; https://pypi.org/pypi/langgraph-checkpoint-postgres/json
- https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL ; https://particula.tech/blog/langgraph-checkpointer-postgres-production

## Addendum (2026-11-15): DeepSeek, Grok, Gemini Transcribe

| Option | Urdu | ogg/opus | Price (approx/min) | Notes |
|---|---|---|---|---|
| xAI grok-voice-transcribe-2.0 | **Yes, officially (`ur`)**, `language` hint param | Yes | ~$0.0017 ($0.10/hr batch, reported) | 500 MB cap, keyterm prompting. Docs: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text |
| Gemini 3.5 Transcribe | **Not in supported-languages table** | Yes | ~$0.003 | Code-switching claimed generally. https://aistudio.google.com/docs/transcribe |
| Gemini 3.5 Flash-Lite (audio as LLM input) | Not officially listed; general model | Yes | ~$0.0005 ($0.30/1M tok, 25 tok/s) | One-step understanding. Flash 3.6/3.8 input prices double 2027-01-01. https://aistudio.google.com/docs/pricing |
| DeepSeek ASR (standalone, released 2026-11-13) | Unknown, not in docs | Unknown | ~$0.0009 (0.39 yuan/hr, one tester, launch discount) | 120 s per request cap (reported). Chat model (deepseek-flash) does NOT take audio natively. https://api-docs.deepseek.com/news/news261113/ |

Revised pick: bake-off among Grok STT (primary candidate), Gemini Flash-Lite audio, ElevenLabs Scribe. DeepSeek only if docs confirm Urdu.
