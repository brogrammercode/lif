# 1More Wallet Implementation Plan

Status — Core flows implemented. Production rollout aur provider acceptance pending hain. Quick schema aur flow ke liye [Wallet Schema and Flow](WALLET_SCHEMA_AND_FLOW.md) dekho.

App → User → Fare Policy mein har category ka Commission (%) editable hai. Wallet payment mein accepted quote ka rate use karke driver ki net earnings credit hoti hain. Draft payout lines usi net amount ko use karti hain, aur gross fare, commission aur net admin aur driver wallet mein separately dikhte hain. Confirmed cash rides record balance-neutral activity and their commission is deducted from funded earnings at payout. Legacy direct UPI stays on its existing manual receipt path.

Current implementation mein additive wallet/payout migration, rider/driver ke account-scoped balance aur ledger reads, admin Wallet Ledger tab, Payouts cycle/driver breakdown views, version-checked schedule settings, aur payment-before-Completed rider UI hain. Wallet ride debit aur driver credit ek DB transaction mein implement hain aur server setting ke through disabled by default hain.

New Android/iOS top-ups open Razorpay Standard Checkout through `razorpay_flutter`. The restored Add money page is shared by wallet, payment methods and ride payment. It uses quick amounts and a numeric keypad. The API claims order creation once per top-up. The app blocks back navigation during checkout and checks server status on SDK return. Capture verification, refund and dispute handling remain server side. Existing Payment Links can reopen in an in-app browser.

`202611270001_wallet_sdk_checkout`, `202611270002_wallet_topup_cancelled` and `202611270003_wallet_topup_failure_reason` were applied to the configured `lif_test` database. Apply them before deploying the API to other environments. The mobile flow and signed webhooks accept both numeric and UUID references as opaque strings. Checkout dismissal closes the in-app attempt, while a later verified capture still credits once. History shows cancelled and failed attempts separately from balance movements and uses Razorpay's failure description when supplied.

Driver Setup Payout form verified UPI destination support karta hai. Scheduled worker verified destination ko pin karta hai, wallet funds hold karta hai, same RazorpayX idempotency key se ambiguous attempt reconcile karta hai, aur provider result par hold settle ya release karta hai. Admin draft exclusions, audited ride-linked credits/deductions, driver blocks, version-checked cycle approval aur 10,000 lines tak CSV export available hain.

### Code audit and recovery

- [x] Rider wallet selection dono apps mein visible hai. Driver receipt confirmation temporarily locked rehti hai jab tak rider method switch kare, wallet payment settle ho, ya 2-minute selection window expire ho. Insufficient balance par same solid Add Money sheet open hoti hai. Actual wallet collection atomic hai.
- [x] Admin upcoming preview current unpaid earnings se per-driver gross, commission, net aur eligibility show karta hai. Refunded earnings draft aur preview dono se exclude hoti hain. Settings ka saved response strict update schema ke saath round-trip karta hai.
- [x] Admin Wallet Ledger IST date, entry type aur reference se filter hota hai. Wallet ride refund rider balance restore karta hai aur unreserved driver earnings reverse karta hai. Draft mein line ho toh driver ko draft se pehle exclude karo. In-flight payout settle hone tak refund block hota hai. Already paid driver ke case mein explicit platform funding consent lagti hai; driver clawback automatic nahi hai.
- [x] Top-up refund aur dispute recovery Razorpay se payment, refund amount aur final dispute status verify karke audited ledger movement karti hai. Funds kam hain ya refund aur chargeback ka overlap verify nahi ho sakta toh review hold continue hota hai. Legacy disputes ke liye dashboard dispute ID enter kar sakte ho. [Razorpay Disputes API](https://tfs.np.razorpay.in/docs/api/disputes)
- [x] Unknown payout submit RazorpayX dashboard payout ID se match karke reconcile hota hai. Worker ki retry window first submission se start hoti hai. Empty approved cycles close hote hain. Lost UPI validation response provider listing mein unique reference aur destination match karke recover hota hai. [RazorpayX account validation listing](https://tfs.np.razorpay.in/docs/api/x/composite-account-validation/fetch-all-transactions)
- [x] Admin mode changes aur new funding records ek hi database lock use karte hain. Pause ke baad same checkout request existing record resume karti hai. Payout controls effective submission state dikhate hain aur worker submission ke time bhi wahi checks apply karta hai. Paused transfers mein timed-out submissions without a provider reference review mein jaati hain.
- [x] Driver profile ka earnings stat real wallet ledger se aata hai. Driver ki direct cash/UPI collections wallet-funded earnings mein include nahi hoti hain.
- [ ] Live provider acceptance, target database migration, real-device rider/driver test aur scheduler deployment verification.
- [ ] Debit-card payout setup requires a provider-supported secure collection flow. Pending provider outcome ke bina transfer manually release karne ka option available nahi hai.

API compile, admin production build, Flutter analysis aur focused wallet tests pass hain. Isolated PostgreSQL mein saari 27 migrations apply hui. Existing schedule retain hua aur new payment controls defaults off verify hue. Actual preview aur draft SQL se gross/commission/net, blocked drivers, refunded earnings exclusion aur same cutoff par duplicate cycle prevention verify kiya. Broader suites mein saved-place revision, vehicle verification aur older mobile screen expectations fail hain. Target DB aur live Razorpay acceptance rollout gate mein pending hain.

### Rollout gate

- **App → User → Payouts → Settings → Payment controls** mein ride wallet collection, top-up mode, live wallet approval, driver UPI verification aur RazorpayX transfers configure karo. Admin save version-checked hai aur audit log mein record hota hai. Nayi database settings default se off hain. Existing payout schedule fields migration ke baad retain hoti hain.
- API environment mein Payment Gateway key ID, key secret, webhook secret, RazorpayX credentials/source account aur scheduler secret configure karo. Enabled/disabled decisions admin ki database settings use karti hain. Test top-ups ke liye matching test credentials aur isolated nonproduction database chahiye. Test aur live funding separate rahegi.
- Approved prepaid wallet arrangement confirm karke **Wallet top-ups → Live** select karo aur approval checkbox save karo. Webhook path `/api/v2/wallet/webhooks/razorpay` par `order.paid`, `payment.captured`, `payment.failed`, `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`, `refund.processed` aur `payment.dispute.created` events configure karo. [Razorpay payment webhooks](https://razorpay.com/docs/webhooks/)
- RazorpayX account mein UPI verification eligibility, funded source account aur allowlisted outbound IP confirm karo. Naye transfers ke liye payout schedule aur transfer switch dono enabled hon. Existing provider transactions ki reconciliation settings pause hone ke baad bhi provider credentials ke saath chalti hai. [RazorpayX UPI payout API](https://razorpay.com/docs/api/x/payouts/create/vpa/)
- Pending acceptance mein provider/device verification, target database migrations aur debit card ke liye provider-approved secure setup hain. Confirmed production payment ya transfer abhi run nahi hua hai.

## 1. Current state aur target

Rider aur driver ek hi Flutter app mein My Wallet use karte hain. Existing `WalletPage`, `WalletIdentityCard`, Add Money aur payment progress screens reuse karenge. `SettingsController` ki preview balance aur transaction history ko real account data se replace karenge. Preview data sirf demo flow mein rahega.

Rider wallet prepaid balance dikhayega. Driver wallet platform ke through collected fares se payable earnings dikhayega. Razorpay Payment Gateway rider top-ups collect karega aur RazorpayX verified driver destinations par weekly payout karega. Gateway settlement aur RazorpayX payout funding ka reconciliation alag track hoga. [Razorpay gig platform payments](https://razorpay.com/blog/payment-solutions-gig-platforms-india/)

## 2. Schema aur money rules

| Record                                | Kya store karega                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Wallet`                              | Account ID, role, currency, available aur held balance. Unique `user_id + kind`, taaki role switch par rider aur driver balances separate rahein.                                        |
| `WalletEntry`                         | Immutable money movement, available/held delta, operation key, linked ride/payment, top-up ya payout, timestamp. Reversal original movement se link hoga.                                |
| `WalletTopUp`                         | Amount, request key, order/payment references, status aur timestamps. Provider order/payment IDs unique honge.                                                                           |
| `DriverPayoutMethod`                  | Driver, UPI ya debit card, provider contact/fund-account reference, masked display label, verification aur default status.                                                               |
| `PayoutSchedule`, `PayoutDriverBlock` | Enabled flag, frequency, IST day/time, cutoff rule, policy version aur driver-level pause/block with reason and optional expiry.                                                         |
| `PayoutCycle`                         | Unique schedule period, cutoff, planned run, policy snapshot, status aur totals.                                                                                                         |
| `DriverPayout`, `DriverPayoutLine`    | Cycle aur driver wallet, amount, destination snapshot aur status. One per driver per cycle. Lines mein source ledger entry, ride/reference, earning, deduction ya adjustment aur amount. |
| `PayoutAdjustment`                    | Cycle, driver, signed amount, reason, optional ride ID ya manual reference, approval status, actor aur timestamps.                                                                       |
| `DriverPayoutAttempt`                 | Settlement reference, attempt number, idempotency key, provider payout ID, UTR aur outcome. Same attempt ka transport retry same payload aur key use karega.                             |
| `ProviderEvent`                       | Provider account/event ID, event type, receive/process timestamps aur processing outcome. Duplicate events DB constraint se dedupe honge.                                                |
| Existing `Payment`                    | Ride ka single payment record reuse karo. Wallet payment ke liye `collection_method = WALLET` aur ledger mein ride/payment reference.                                                    |

Har amount integer paise mein store karo. Balance mutation, ledger entry aur related payment/payout status ek DB transaction mein update karo. Fixed lock order aur unique operation keys double debit aur concurrent payout se protect karenge. Existing users ke wallets zero balance se lazily create honge. Historical cash/UPI rides ya preview balances migrate mat karo.

## 3. Rider app flow

1. **My Wallet** mein available balance, **Add money**, **Payment methods**, **Activity** aur paginated history dikhao. Loading, empty, retry aur pending states existing solid UI mein render karo.
   Wallet modals use the ride flow's `RideStagePanel` and `RideSheetHandle`. The modal opens to its content height, moves above the keyboard, and scrolls the white body when space is limited.
   Payment methods mein rider apni UPI ID save ya remove kar sakta hai. Saved ID reference hai aur ride payment verify ya collect nahi karti. Debit card entry Razorpay Standard Checkout mein hoti hai. Standalone card enrollment ke liye Razorpay tokenisation setup pending hai.
2. **Add money** page amount validate karta hai. Backend local top-up record aur SDK ke liye Razorpay order create karta hai. Repeated tap same top-up resume karta hai. Response lost ho toh backend same receipt se order search karta hai. Older clients can still request Payment Links.
3. **Top-up result** provider order, captured payment, amount aur currency verify karke wallet ek baar credit karta hai. Legacy checkout additionally verifies its Payment Link. Signed webhooks and status checks use the same confirmation path. My Wallet checks an existing pending payment when history loads and refreshes the ledger on capture. A captured top-up appears once when its ledger credit is loaded. [Razorpay payment verification](https://razorpay.com/security/checklist/)
   My Wallet merges attempts and ledger activity into one scrollable timeline. Every item opens the same solid transaction sheet with its status, amount, date, reference and relevant provider or ledger details.
   Continue to Razorpay opens the animated Payment Progress sheet before creating the order. The sheet launches Razorpay, blocks navigation during native checkout and verification, and updates in place to the server-confirmed result. After a terminal result, Add more money resets the amount form and Back to wallet returns to the refreshed wallet. Pending history opens the same sheet and can resume checkout in place, check status, or cancel. Settled history keeps the standard details sheet.
4. **Ride end → Payment → Completed.** Dono apps mein Payment ek separate phase hoga. Shared ride sheet ka black status bar aur white body use karo. Rider screen final fare aur method selector dikhaye — Wallet (available balance), Cash, aur enabled existing methods jaise direct UPI. Wallet balance kam ho toh Add money ya doosra method offer karo. Top-up se return par payable ride dobara load karo aur rider se payment confirm karvao.
5. Backend rider ownership, payable ride state aur final fare verify kare. Ek transaction mein rider wallet debit, assigned driver earnings credit aur ride payment paid mark karo. Wallet aur direct receipt confirmation same payment record par serialize hon, taaki dono methods ek hi ride collect na kar sakein. Rider aur driver server status se completed state dekhen. Cash/direct UPI ka existing receipt confirmation flow use karo.
6. **Activity** mein top-up aur refund ka status, amount aur reference dikhao. Ride debit directly existing ride detail sheet khole. Pending top-up existing progress screen khole.

## 4. Driver app flow

**Ride end → Payment → Completed.** Driver ko rider ke saath same payment phase mein rakho. Shared solid ride sheet ke black bar mein amount aur payment status, white body mein selected method aur next action dikhao.

| Server state                              | Driver screen                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rider method choose kar raha hai          | Waiting for payment selection.                                                                                                                                                    |
| Rider wallet payment process kar raha hai | Processing status. Cash confirmation disable rahe jab tak pending payment resolve ya server par safely cancel na ho.                                                              |
| Wallet payment confirmed                  | Driver wallet credit dikhao aur dono apps ko automatically Completed par bhejo.                                                                                                   |
| Cash ya direct UPI selected               | Receipt confirm karne ke liye existing Payment Received slider dikhao. Driver real payment milne par confirm kare. Backend confirmation ke baad dono apps Completed par jaayengi. |

App resume ya reconnect par dono sides same server payment state reload karein. Method switch, rider submit aur driver receipt confirmation ko backend same ride payment record par serialize kare. Agar wallet attempt fail ho, rider ko retry ya method switch mile aur driver ko updated status dikhe.

1. **My Wallet** mein available balance, payout processing amount, **Setup payout**, **Ledger** aur **Payout cycle** dikhao.
2. **Setup payout** ke solid sheet mein bank account, UPI, ya debit card ke linked bank account ko save karo. Debit card ke sirf last four digits label mein rehte hain. Direct debit-card disbursement ke liye provider-approved integration alag chahiye. [RazorpayX bank payouts](https://razorpay.com/docs/api/x/payouts/create/bank-account)
3. **Save payout account** selected destination ko default banata hai. Existing saved destination par tap karke default switch kar sakte hain. Pending details encrypted rehti hain aur configured worker provider fund account link karne ke baad unhe clear karta hai. In-flight payout apna original destination aur mode use karta hai.
4. **Earnings history** mein wallet-paid ride credits aur weekly payout entries dikhao. Payout detail mein week, amount, masked destination, status aur available hone par UTR dikhao. Driver ko directly mili cash/UPI fare weekly payout balance mein include nahi hogi.

## 5. API aur scheduled payout jobs

Payout Settings mein frequency aur optional next payout date set hoti hai. Chosen date cadence anchor karti hai. Date blank ho toh changed cadence latest recorded cycle ke cutoff se calculate hoti hai. Fixed daily cron due cycle pick karta hai aur enabled transfers RazorpayX par submit ya reconcile karta hai.

| Implemented API                                                                                                           | Kaam                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /wallet`                                                                                                             | Current account aur authorized wallet role ka balance aur bounded history.                              |
| `GET /wallet/topups`, `POST /wallet/topups`, `POST /wallet/topups/:id/check`                                              | Top-up initiate, resume aur provider-verified status.                                                   |
| `GET /trips/:id/context`, `POST /trips/:id/payment`, `POST /rides/:id/payments/wallet`                                    | Shared payment status, method selection aur idempotent wallet collection.                               |
| `GET /driver/wallet/payout-methods`, `POST /driver/wallet/payout-methods`, `POST /driver/wallet/payout-methods/:id/check` | UPI setup, verification status aur default destination.                                                 |
| `GET /driver/wallet/payouts/:id`, `POST /wallet/webhooks/razorpay`, `GET /internal/cron`                                  | Account-scoped payout detail, signed wallet webhooks aur daily RazorpayX polling.                       |
| `/admin/users/:id/wallet-ledger`, `/admin/payouts/*`                                                                      | Ledger read, cycle preview/history/report, driver exclusions, adjustments, schedule aur block settings. |

Flutter wallet controller balance, activity, checkout progress aur payout setup state own karega. NestJS wallet module ledger/top-ups own karega. Ride collection existing payment service ke transaction rules use karegi. Provider secrets server environment mein rahenge.

1. **Schedule aur cutoff.** Shared protected cron roz 05:00 IST par DB se due cycles pick karta hai. Admin daily/weekly/monthly cadence ya next payout date set kar sakta hai. Worker latest recorded cutoff check karta hai. Missed cycles bounded batches mein catch up hote hain. [Daily cron plan](DAILY_CRON_PLAN.md)
2. **Reserve, phir submit.** Pending cycle lock karo, settings aur driver breakdown freeze karo, aur DB transaction mein eligible funds available se held mein move karo. Worker bounded batches mein funded RazorpayX account se submit kare. Persisted attempt key `X-Payout-Idempotency` mein bhejo. Concurrent triggers, restart aur timeout mein same cycle/attempt resume ho. Failed work retry schedule par aaye aur unresolved attempts reconciliation mein dikhein. [RazorpayX payout API](https://razorpay.com/docs/api/x/payout-wallet/create/payout-composite/?preferred-country=IN)
3. **Outcome reconcile karo.** Queued/processing mein funds held rahenge. Confirmed processed payout par hold settle karo. Definitive failure/reversal par funds once release karo. Timeout par payout status reconcile karke same attempt resume karo. Naya attempt sirf terminal outcome confirm hone ke baad create karo. Duplicate ya late webhooks state ko backwards move na karein. [RazorpayX webhook states](https://axisbank-docs.razorpay.com/razorpayx/webhooks/payloads/)
4. **Refunds aur disputes.** Approved fare refund rider ko compensating credit dega. Driver share payout se pehle recover ho sakta hai toh ledger adjust karo. Payout submit ya settle ho chuka hai toh separately tracked adjustment/review mein bhejo. Top-up refund ya chargeback par provider event reconcile karo aur already spent funds ko approved recovery policy ke hisaab se handle karo.

## 6. Admin web

### Users → User details → Wallet Ledger

The admin ledger shows available and held balances and one paginated timeline of posted entries and top-up attempts. A captured top-up with a ledger credit appears once. Cards open the shared admin details dialog with provider references, failure reasons, balance movements and existing refund or reconciliation actions where applicable.

App wallet jaisa balance aur activity overview dikhao. Rider aur driver balances ko role tabs mein dikhana hai. Admin drill-down mein opening/closing balance, available/held movement, amount, event status/time, linked ride, top-up, payout cycle, provider IDs, reversal aur admin adjustment reason/actor dikhao. Filters for date, transaction type/status aur reference; history paginated rahe. Ledger records read-only hon. Access existing verified admin permissions se enforce karo.

### App → User → Payouts

- **Upcoming** mein next run, cutoff, eligible drivers, estimated total aur held/excluded amounts dikhao. Draft cycle mein admin driver ko single cycle se remove/re-add kar sake. Excluded earnings wallet mein carry forward hongi. Persistent driver block/unblock separately manage hoga.
- **Adjust amount** mein selected driver ke draft payout mein credit/deduction, required reason aur optional linked Ride ID ya manual reference add karo. Ride link driver se belong karna chahiye. Final amount, available balance aur effect preview karo. Deduction ko amount due aur funded balance limits ke andar validate karo. Har change revision check, confirmation aur audit log ke saath store ho. Cycle freeze ke baad correction subsequent cycle mein audited adjustment ke through ho.
- **Cycle history** mein scheduled, processing, paid, partially paid aur failed cycles, driver counts, totals aur provider outcomes dikhao. Per driver detail mein har ride ka fare/earning, deductions, manual adjustments, net payout, status, attempt aur UTR dikhao. Cycle aur driver breakdown ka downloadable report do.
- **Settings popup** mein daily/weekly/monthly cadence aur next payout date rakho. Separate **Payment controls** dialog payout pause, minimum, approval aur provider settings retain karta hai. Driver blocks ka apna dialog hai. Pause future submissions rokega aur already submitted payouts ki reconciliation continue rahegi. Settings edits future cycles par apply honge.

Existing admin sidebar, tabs, tables, action menus aur dialogs reuse karo. Read, adjustment, schedule aur block permissions alag enforce karo. Manual adjustments aur exclusions upcoming draft par apply hon, ledger posting cycle reservation ke saath atomic rahe, aur financial history actor, reason, reference aur timestamp preserve kare.

## 7. Build order aur acceptance

- [ ] **Provider readiness** — Razorpay se permitted wallet/PPI model, settlement route, payout funding, UPI/debit card availability, verification, limits aur fees confirm karo. Live top-ups approved arrangement ke baad enable karo. Closed-system PPI third-party services settle nahi kar sakta. [RBI PPI directions](https://www.rbi.org.in/scripts/FS_Notification.aspx?Id=12156&Mode=0&fn=9)
- [ ] **Backend foundation** — Additive Prisma migration, immutable ledger, account permissions, webhook processing aur status reconciliation ship karo. API route manifest update karo.
- [ ] **Rider integration** — Existing wallet screens connect karo. Sandbox mein capture, cancel, lost callback, duplicate webhook, insufficient balance aur wallet/direct collection race verify karo.
- [ ] **Driver integration** — Setup payout sheet, shared payment phase, earnings breakdown aur scheduled worker connect karo. Invalid UPI, changed destination, repeated job, payout timeout, queued status, reversal aur missing funding verify karo.
- [ ] **Admin integration** — Per-user Wallet Ledger aur Payouts sections connect karo. Schedule changes, cycle exclusion, block expiry, ride-linked adjustment, concurrent edits, freeze aur downloadable reports verify karo.
- [ ] **Rollout** — Sandbox aur device testing ke baad limited live pilot. Gateway settlement reports, wallet liability, driver payable ledger aur RazorpayX payout report match karo. Unresolved top-ups/payouts aur balance mismatch ke alerts enable karo.

## Ride payment phase

- [x] Rider aur driver ke Payment phases use the existing black-header, white-body ride sheet. Cash waits for the assigned driver's receipt confirmation. Wallet verifies the platform debit and driver credit. UPI opens Razorpay from the same animated progress sheet. Verified payment unlocks the receipt.
- [x] Cash receipts are recorded on both wallets with zero available/held movement. The selected quote supplies commission. A negative cash commission line reduces the next funded payout. Commission carries forward when funded earnings are insufficient.
- [x] Razorpay ride checkout owns a separate order bound to the ride and final fare. The signed wallet webhook and in-app check both reconcile that order. A captured UPI payment credits driver earnings once. Refunds and disputes can require manual payout review.
- [x] Driver wallet and payout methods use the same activation and role rule as Driver Home. An exited or unactivated account cannot use driver payout methods.
- [x] Migration 202611270004 was applied to lif_test. Prisma db push confirmed the database was in sync.
- [x] Isolated PostgreSQL fixtures verified cash commission reduces funded payouts and carries forward when cash is the only activity. Focused Flutter payment tests and admin browser tests cover checkout, progress, payout settings and wallet history.
- [x] Reopening a standard unpaid rider trip from My Rides uses the same payment choices and progress sheet. A terminal payment status from the ride takes priority over a stale provider result. Flutter tests cover rider receipt gating, cash confirmation, and driver payment progress. API tests cover idempotent Wallet debits and earnings and replayed UPI reconciliation.
- [ ] Enable Allow Razorpay UPI for rides in App > User > Payouts > Settings > Payment controls after acceptance. Ride UPI requires live Gateway credentials and a quote that permits UPI. Verify real-device checkout and the signed webhook before enabling it for customers.

Read-only verification on `lif_test` found Wallet ride payments enabled, live Gateway credentials detected and the ride UPI switch off. No live payment was submitted.

### Driver wallet and payout cycle

- [x] Driver My Wallet uses matching Setup payout, Ledger and Payout cycle buttons above the transaction area. Ledger opens by default. Both history buttons scroll to the inline transaction area, where Payout cycle shows the next run and paginated credited payouts.
- [x] Available balance includes unreserved earnings net of outstanding cash commissions and existing draft adjustments. Reserved transfers show separately. The cash chip shows the gross cash already collected since the last paid cycle cutoff, or all recorded cash for drivers without a paid cycle.
- [x] PostgreSQL temporary-table fixtures verify commission, draft adjustments, reserved transfers and cash totals. Flutter widget tests verify navigation, net balance, the cash chip and payout detail.

### Simplified payout setup

- [x] Save bank account, UPI, or debit-card-linked bank account before RazorpayX credentials are configured. The setup sheet uses black selected method chips whose labels keep their size while loading. Save selects the default. The driver can switch saved destinations without re-entering details.
- [x] Existing scheduled worker provisions the selected fund account when transfers are enabled. UPI uses UPI and bank destinations use IMPS. Provider errors leave the draft and funds available for retry. Existing provider references and in-flight payouts retain their original mode.
- [x] Migration 202611270005 and Prisma push completed on lif_test. Flutter verifies the save and masked default display. API provider fixtures cover saving while unconfigured and later bank fund account linking.
- [ ] Verify a real transfer after RazorpayX credentials and scheduled transfers are configured. The UPI verification switch applies to legacy pending verification records. New destination saving is independent of this switch.

Optional `PAYOUT_DETAILS_SECRET` encrypts pending destinations. When omitted, the API derives a separate encryption key from `JWT_SECRET`. Keep the effective secret stable while any saved destinations await linking.
