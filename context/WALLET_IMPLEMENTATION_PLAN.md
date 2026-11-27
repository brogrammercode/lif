# 1More Wallet Implementation Plan

Status — Core flows implemented. Production rollout aur provider acceptance pending hain. Quick schema aur flow ke liye [Wallet Schema and Flow](WALLET_SCHEMA_AND_FLOW.md) dekho.

App → User → Fare Policy mein har category ka Commission (%) editable hai. Wallet payment mein accepted quote ka rate use karke driver ki net earnings credit hoti hain. Draft payout lines usi net amount ko use karti hain, aur gross fare, commission aur net admin aur driver wallet mein separately dikhte hain. Cash/direct UPI collection is deduction ke scope se bahar hai.

Current implementation mein additive wallet/payout migration, rider/driver ke account-scoped balance aur ledger reads, admin Wallet Ledger tab, Payouts cycle/driver breakdown views, version-checked schedule settings, aur payment-before-Completed rider UI hain. Wallet ride debit aur driver credit ek DB transaction mein implement hain aur server setting ke through disabled by default hain.

Hosted Razorpay checkout app wallet se open hota hai. Capture verification, signed webhooks, pending status recovery aur top-up refund ledger entries implement hain. Spent funds wale refunds aur disputes manual review mein jaate hain aur wallet spending hold hoti hai.

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

- **App → User → Payouts → Settings → Payments** mein ride wallet collection, top-up mode, live wallet approval, driver UPI verification aur RazorpayX transfers configure karo. Admin save version-checked hai aur audit log mein record hota hai. Nayi database settings default se off hain. Existing payout schedule fields migration ke baad retain hoti hain.
- API environment mein Payment Gateway key ID, key secret, webhook secret, RazorpayX credentials/source account aur scheduler secret configure karo. Enabled/disabled decisions admin ki database settings use karti hain. Test top-ups ke liye matching test credentials aur isolated nonproduction database chahiye. Test aur live funding separate rahegi.
- Approved prepaid wallet arrangement confirm karke **Wallet top-ups → Live** select karo aur approval checkbox save karo. Webhook path `/api/v2/wallet/webhooks/razorpay` par `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`, `refund.processed` aur `payment.dispute.created` events configure karo. [Razorpay Payment Links](https://hdfcbank-collectnow-docs.razorpay.com/api/payments/payment-links/)
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
   Payment methods mein rider apni UPI ID save ya remove kar sakta hai. Saved ID reference hai aur ride payment verify ya collect nahi karti. Debit card entry Razorpay ke hosted top-up checkout mein hoti hai. Standalone card enrollment ke liye Razorpay tokenisation setup pending hai.
2. **Add money** sheet amount validate karti hai. Backend approved limits check karke local top-up record aur hosted Razorpay Payment Link create karta hai. Repeated tap same top-up request resume karta hai. Response lost ho toh backend provider se same reference search karta hai.
3. **Top-up result** provider Payment Link, order, amount aur currency verify karke wallet ek baar credit karta hai. Signed webhook aur status check isi confirmation path ko use karte hain. Checkout dismiss ya network timeout par Activity se status resume ho sakta hai. [Razorpay payment verification](https://razorpay.com/security/checklist/)
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

1. **My Wallet** mein available earnings, payout processing amount aur transaction history dikhao. **Setup payout** top section ka ek hi action hoga.
2. **Setup payout** existing solid sheet primitives se banao. Black header, white body, shared fields aur primary button use karo. **UPI** tab mein account holder name aur UPI ID. **Debit card** tab mein RazorpayX ke approved secure collection flow se required card details. Card option enable karne se pehle account eligibility aur secure collection confirm karo. 1More raw card number, CVV, PIN ya OTP store ya log nahi karega. [RazorpayX payout methods](https://razorpay.com/x/terms/)
3. Backend payout destination create/verify kare. Sheet mein verification pending, verified ya failed state dikhao. New method verified hone par hi default switch karo. In-flight payout apna original destination reference use karega.
4. **Earnings history** mein wallet-paid ride credits aur weekly payout entries dikhao. Payout detail mein week, amount, masked destination, status aur available hone par UTR dikhao. Driver ko directly mili cash/UPI fare weekly payout balance mein include nahi hogi.

## 5. API aur scheduled payout jobs

Next run settings mein configured cadence ki IST date/time show hoti hai. Admin ek run move kar sakta hai. Override ke baad recurring schedule resume hota hai. Protected cron stored due time se cycle draft prepare karta hai, duplicate runs avoid karta hai, aur transfer enable hone par eligible payouts RazorpayX par submit ya reconcile karta hai.

| Implemented API                                                                                  | Kaam                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /wallet` | Current account aur authorized wallet role ka balance aur bounded history. |
| `GET /wallet/topups`, `POST /wallet/topups`, `POST /wallet/topups/:id/check` | Top-up initiate, resume aur provider-verified status. |
| `GET /trips/:id/context`, `POST /trips/:id/payment`, `POST /rides/:id/payments/wallet` | Shared payment status, method selection aur idempotent wallet collection. |
| `GET /driver/wallet/payout-methods`, `POST /driver/wallet/payout-methods`, `POST /driver/wallet/payout-methods/:id/check` | UPI setup, verification status aur default destination. |
| `GET /driver/wallet/payouts/:id`, `POST /wallet/webhooks/razorpay`, `GET /internal/cron` | Account-scoped payout detail, signed wallet webhooks aur daily RazorpayX polling. |
| `/admin/users/:id/wallet-ledger`, `/admin/payouts/*`                                            | Ledger read, cycle preview/history/report, driver exclusions, adjustments, schedule aur block settings.                                                        |

Flutter wallet controller balance, activity, checkout progress aur payout setup state own karega. NestJS wallet module ledger/top-ups own karega. Ride collection existing payment service ke transaction rules use karegi. Provider secrets server environment mein rahenge.

1. **Schedule aur cutoff.** Shared protected cron roz 05:00 IST par DB se due cycles pick karta hai. Admin daily/weekly/monthly cutoff ya one-time override set kar sakta hai. Cutoff ke baad pehle daily tick mein processing shuru hoti hai. Missed cycles bounded batches mein catch up hote hain. [Daily cron plan](DAILY_CRON_PLAN.md)
2. **Reserve, phir submit.** Pending cycle lock karo, settings aur driver breakdown freeze karo, aur DB transaction mein eligible funds available se held mein move karo. Worker bounded batches mein funded RazorpayX account se submit kare. Persisted attempt key `X-Payout-Idempotency` mein bhejo. Concurrent triggers, restart aur timeout mein same cycle/attempt resume ho. Failed work retry schedule par aaye aur unresolved attempts reconciliation mein dikhein. [RazorpayX payout API](https://razorpay.com/docs/api/x/payout-wallet/create/payout-composite/?preferred-country=IN)
3. **Outcome reconcile karo.** Queued/processing mein funds held rahenge. Confirmed processed payout par hold settle karo. Definitive failure/reversal par funds once release karo. Timeout par payout status reconcile karke same attempt resume karo. Naya attempt sirf terminal outcome confirm hone ke baad create karo. Duplicate ya late webhooks state ko backwards move na karein. [RazorpayX webhook states](https://axisbank-docs.razorpay.com/razorpayx/webhooks/payloads/)
4. **Refunds aur disputes.** Approved fare refund rider ko compensating credit dega. Driver share payout se pehle recover ho sakta hai toh ledger adjust karo. Payout submit ya settle ho chuka hai toh separately tracked adjustment/review mein bhejo. Top-up refund ya chargeback par provider event reconcile karo aur already spent funds ko approved recovery policy ke hisaab se handle karo.

## 6. Admin web

### Users → User details → Wallet Ledger

App wallet jaisa balance aur activity overview dikhao. Rider aur driver balances ko role tabs mein dikhana hai. Admin drill-down mein opening/closing balance, available/held movement, amount, event status/time, linked ride, top-up, payout cycle, provider IDs, reversal aur admin adjustment reason/actor dikhao. Filters for date, transaction type/status aur reference; history paginated rahe. Ledger records read-only hon. Access existing verified admin permissions se enforce karo.

### App → User → Payouts

- **Upcoming** mein next run, cutoff, eligible drivers, estimated total aur held/excluded amounts dikhao. Draft cycle mein admin driver ko single cycle se remove/re-add kar sake. Excluded earnings wallet mein carry forward hongi. Persistent driver block/unblock separately manage hoga.
- **Adjust amount** mein selected driver ke draft payout mein credit/deduction, required reason aur optional linked Ride ID ya manual reference add karo. Ride link driver se belong karna chahiye. Final amount, available balance aur effect preview karo. Deduction ko amount due aur funded balance limits ke andar validate karo. Har change revision check, confirmation aur audit log ke saath store ho. Cycle freeze ke baad correction subsequent cycle mein audited adjustment ke through ho.
- **Cycle history** mein scheduled, processing, paid, partially paid aur failed cycles, driver counts, totals aur provider outcomes dikhao. Per driver detail mein har ride ka fare/earning, deductions, manual adjustments, net payout, status, attempt aur UTR dikhao. Cycle aur driver breakdown ka downloadable report do.
- **Settings popup** shared admin dialog mein ho. Enable/disable, daily/weekly/monthly cadence, IST time, weekly weekday, monthly date aur shorter months ka cutoff, minimum payout, approval requirement aur driver block list with reason/expiry configure karo. Next run preview dikhao. Disable future submissions rokega aur already submitted payouts ki reconciliation continue rahegi. Settings edits future cycles par apply honge.

Existing admin sidebar, tabs, tables, action menus aur dialogs reuse karo. Read, adjustment, schedule aur block permissions alag enforce karo. Manual adjustments aur exclusions upcoming draft par apply hon, ledger posting cycle reservation ke saath atomic rahe, aur financial history actor, reason, reference aur timestamp preserve kare.

## 7. Build order aur acceptance

- [ ] **Provider readiness** — Razorpay se permitted wallet/PPI model, settlement route, payout funding, UPI/debit card availability, verification, limits aur fees confirm karo. Live top-ups approved arrangement ke baad enable karo. Closed-system PPI third-party services settle nahi kar sakta. [RBI PPI directions](https://www.rbi.org.in/scripts/FS_Notification.aspx?Id=12156&Mode=0&fn=9)
- [ ] **Backend foundation** — Additive Prisma migration, immutable ledger, account permissions, webhook processing aur status reconciliation ship karo. API route manifest update karo.
- [ ] **Rider integration** — Existing wallet screens connect karo. Sandbox mein capture, cancel, lost callback, duplicate webhook, insufficient balance aur wallet/direct collection race verify karo.
- [ ] **Driver integration** — Setup payout sheet, shared payment phase, earnings breakdown aur scheduled worker connect karo. Invalid UPI, changed destination, repeated job, payout timeout, queued status, reversal aur missing funding verify karo.
- [ ] **Admin integration** — Per-user Wallet Ledger aur Payouts sections connect karo. Schedule changes, cycle exclusion, block expiry, ride-linked adjustment, concurrent edits, freeze aur downloadable reports verify karo.
- [ ] **Rollout** — Sandbox aur device testing ke baad limited live pilot. Gateway settlement reports, wallet liability, driver payable ledger aur RazorpayX payout report match karo. Unresolved top-ups/payouts aur balance mismatch ke alerts enable karo.
