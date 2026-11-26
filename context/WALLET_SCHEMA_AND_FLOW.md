# 1More Wallet

## 1. Proposed schema

| Table | Main fields |
| --- | --- |
| `Wallet` | `id`, `user_id`, `kind` (`RIDER` / `DRIVER`), `currency` (`INR`), `available_paise`, `held_paise`. Unique per user and kind. |
| `WalletEntry` | `id`, `wallet_id`, `type`, `available_delta_paise`, `held_delta_paise`, `ride_id?`, `topup_id?`, `payout_id?`, `operation_key` (unique), `created_at`. Immutable ledger for top-ups, fare debits, driver earnings, refunds and payout movements. |
| `WalletTopUp` | `id`, `wallet_id`, `amount_paise`, `razorpay_order_id` (unique), `razorpay_payment_id?` (unique), `request_key` (unique), `status`, timestamps. |
| `DriverPayoutMethod` | `id`, `driver_id`, `type` (`UPI` / `DEBIT_CARD`), `razorpay_contact_id`, `razorpay_fund_account_id`, `masked_label`, `verification_status`, `is_default`. One active default per driver. |
| `DriverPayout` | `id`, `wallet_id`, `method_id`, `week_start_ist`, `amount_paise`, `status`, `razorpay_payout_id?` (unique), `idempotency_key` (unique), `utr?`, timestamps. One settlement per driver per week. |
| `ProviderEvent` | `provider`, `event_id`, `event_type`, `processed_at`. Unique per provider and event ID. |

Existing ride `Payment` reuse karo. Wallet payment ka `collection_method = WALLET` hoga aur same ride ke liye ek hi payment record rahega. Balance aur ledger entries ek DB transaction mein update hongi. Har amount integer paise mein hoga.

## 2. Wallet use flow

### Rider

1. **My Wallet** mein balance, **Add money**, **Payment methods** aur **Activity** dikhenge.
2. **Add money** → amount select karo → hosted Razorpay Payment Link khulega. Backend provider payment, order, amount aur currency verify karke wallet ek baar credit karta hai. Pending ya failed payment Activity mein dikhti hai. [Razorpay payment verification](https://razorpay.com/security/checklist/)
3. **Ride complete → Pay with Wallet** → backend final fare aur balance check karega. Balance kam hai toh top-up ya existing payment method choose karo. Balance sufficient hai toh same transaction mein rider debit, ride payment marked paid aur driver earnings credit honge. Approved wallet fare refund ledger mein reverse entry se dikhega.

### Driver

1. **My Wallet** mein available earnings, processing payout aur history dikhenge. Ek hi action hoga, **Setup payout**. Ye black header aur white body wala solid sheet kholega. **UPI** mein account holder name aur UPI ID fields hongi. **Debit card** option tab enable hoga jab RazorpayX us account ke liye card payouts aur secure card detail collection support confirm kare. 1More sirf provider reference aur masked label rakhega. [RazorpayX payout methods](https://razorpay.com/x/terms/)
2. Wallet se paid rides ki earnings balance mein aayengi. Cash ya driver ko direct UPI se mili fare payout balance mein credit nahi hogi.
3. **Week end (IST)** par job verified payout method wale drivers ki eligible earnings hold karke RazorpayX payout submit karega. Missing ya unverified method par earnings available rahengi. Signed webhook ya provider status check se success confirm hone par hold settle hoga. Confirmed failure ya reversal par funds available balance mein wapas aayenge. Timeout par same payout key se reconcile karo, taaki transfer duplicate na ho.

Live top-ups enable karne se pehle Razorpay ke saath wallet/PPI arrangement aur driver settlement model confirm karo. RBI ke closed-system wallet rules third-party services ki settlement allow nahi karte. [RBI PPI directions](https://www.rbi.org.in/scripts/FS_Notification.aspx?Id=12156&Mode=0&fn=9)
