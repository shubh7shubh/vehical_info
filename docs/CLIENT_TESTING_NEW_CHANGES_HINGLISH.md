# Naye Changes — Testing Guide (Hinglish)

Namaste! Aapne pichli baar jo **8 changes** bataye thay, woh sab ho gaye hain.

Yeh guide **sirf un 8 cheezon ki** hai — poora system dobara test karne ki zarurat
nahi. Sirf yeh 8 test kar lijiye aur bata dijiye kya theek hai, kya nahi.

> Poori guide (saare 21 tests) `docs/CLIENT_TESTING_HINGLISH.md` mein hai — agar
> naya banda system seekh raha ho toh woh padhaiye. Yeh wali chhoti guide sirf
> naye kaam ke liye hai.

---

## Shuru karne se pehle

| | |
|---|---|
| **Website** | https://vehical-info.vercel.app/ |
| **Aapka login (Owner)** | `client@vehiclefinance.in` / `Client@2026` |

⚠️ **Important:** Owner khud customer add/edit nahi kar sakta — woh sirf dekhne ke
liye hai. **Neeche ke saare tests apne branch ke Admin ya Employee login se
kariye** (jaise `pune.admin@test.com` / `Welcome123!` jo aapne pehle banaya tha).
Agar woh account nahi hai, toh Owner se login karke **Branches** mein ek branch +
uska admin bana lijiye, phir us admin se login kijiye.

**Browser:** Chrome ya Edge sabse achha chalega. Mobile par bhi chalega, lekin
**print wale test (Test 1 aur 6) computer par kariye** — print ka preview wahin
theek se dikhta hai.

---

## 🧾 Ek nazar mein — kya-kya theek hua

| # | Aapne kaha tha | Test |
|---|---|---|
| 1 | Har EMI ki invoice print nikalni chahiye | **Test 1** |
| 2 | Hapta bharne ka option nahi mil raha | **Test 2** |
| 3 | Har page par Back button chahiye | **Test 3** |
| 4 | Print par kitne hapte baaki hain dikhna chahiye | **Test 1** |
| 5 | Loan date daalte hi First EMI date aani chahiye | **Test 4** |
| 6 | Penalty mahine ka ₹500 ho | **Test 5** |
| 7 | Bank naam: Dhanshree aur Bhagyalaxmi | **Test 4** |
| 8 | Customer page par Edit / Print / Invoice Print | **Test 1, 6, 7** |

---

## Test 4 pehle kar lijiye (kyunki uska customer aage kaam aayega)

Order aisa rakha hai ki ek hi customer par saare test ho jayein:
**Test 4 → 5 → 1 → 2 → 3 → 6 → 7 → 8**

Lekin aap kisi bhi order mein kar sakte ho — agar aapke paas pehle se koi
customer hai toh Test 4 chhod bhi sakte ho.

---

## Test 4 — 🆕 First EMI date apne aap aati hai + naye bank naam

**Aapne kaha tha:** *"नवीन कस्टमर ॲड करत असताना लोन डेट किंवा सेल डेट टाकली की
ऑटोमॅटिक फर्स्ट ईएमआय ची डेट आली पाहिजे."*

1. Admin/Employee se login karo → **Customers** → **Add customer**
2. **Loan details** section tak scroll karo
3. **Purchase / loan date** mein **5 mahine pehle ki** koi tareekh daalo

   > Aaj agar August 2026 hai toh March 2026 ki koi tareekh, jaise `15-03-2026`.
   > Purani date isliye taaki penalty aur rang wale test turant dikh jayein —
   > mahino ka intezaar na karna pade.

✅ **Kya hona chahiye:** bagal wala **First EMI date** ka box **apne aap bhar
jayega** — theek **ek mahina baad** ki tareekh (yaani `15-04-2026`). Neeche chhote
akshar mein likha aayega:
*"Filled automatically — one month after the purchase date."*

### Do cheezein try karke dekho

- **Loan date badlo** → ✅ First EMI date bhi apne aap khisak jayegi.
- **First EMI date khud badal do** (jaise 10 din aage kar do) → ✅ ab neeche likha
  aayega *"Set by hand"* aur woh apne aap nahi badlegi. Wapas automatic karna ho
  toh **Reset to automatic** par click karo.

### 🆕 Bank ke naam bhi check karo

Usi form mein **Bank assigned** ki list kholo →
✅ ab **Dhanshree Bank** aur **Bhagyalaxmi Bank** dikhne chahiye
(pehle "Bank A" / "Bank B" likha aata tha).

### Ab customer save kar do

**📋 Baaki boxes aise bharo:**

| Box | Value |
|---|---|
| Account number | `3473` |
| Name | `Ramesh` |
| Father / middle name | `Suresh` |
| Surname | `Patil` |
| Village | `Wagholi` |
| Post office | `Lohegaon` |
| Taluka | `Haveli` |
| District | `Pune` |
| Mobile number 1 | `9876543210` |
| Model no. | `Hero Splendor Plus` |
| Bank | `Dhanshree Bank` |
| Loan amount | `60000` |
| Installment / EMI | `5000` |
| Tenure (months) | `12` |

**Save customer** dabao.

✅ Aap seedhe Ramesh Patil ke page par pahunch jaoge. **Loan** tab kholo →
✅ wahan **First EMI date** aur **Penalty: Monthly fixed · ₹500** dikhega.

> Vehicle aur Guarantor ki details **optional** hain — "Vehicle & guarantor" wala
> section kholna zaroori nahi.

---

## Test 5 — 🆕 Penalty apne aap ₹500 prati mahina

**Aapne kaha tha:** *"पेनल्टी हे मंथली पाचशे रुपये असले पाहिजे."*

1. Ramesh Patil ke page par **Record EMI payment** (neela button) dabao
2. **Add installment** form dekho

✅ **Penalty ka box khaali nahi hoga** — usme apne aap paisa bhara hoga, aur
neeche likha hoga kaise nikala:

> *"Penalty pre-filled at ₹500 × 5 months late = ₹2,500. Edit it, or set 0 to
> waive."*

Matlab: Ramesh 5 mahine se ek bhi hapta nahi bhara, isliye **₹500 × 5 = ₹2,500**.

### ⚠️ Yeh poori tarah aapke haath mein hai

System **apne aap paisa nahi kaatta** — bas ek **suggestion** deta hai:

- Number badal sakte ho (jaise `500` kar do)
- `0` kar ke **penalty poori maaf** kar sakte ho
- Jo aap save karoge, wahi record hoga

**Test ke liye:** Penalty ko `500` kar do aur baaki form bharo —

| Box | Value |
|---|---|
| Month # | `1` |
| Date | aaj ki tareekh |
| Installment (₹) | `5000` (apne aap aa jata hai) |
| Penalty (₹) | `500` |
| Receipt no. | `R-001` |
| Mode | `Cash` |
| Signature taken | tick ✓ |

**Record installment** dabao.

✅ Green banner: **"Installment recorded"** — aur uske bagal mein ek
**Print receipt** ka button. Neeche grid mein row aa jayegi jismein
**Total = 5000 + 500 = 5500**, aur upar **"Paid 1 of 12 · 11 pending"**.

**Ek aur hapta daal do** — Month # `2`, Installment `5000`, Penalty `0`,
Receipt `R-002`. ✅ Ab **"Paid 2 of 12 · 10 pending"** ho jayega.

---

## Test 1 — 🧾 EMI ki invoice / pavti print karo ⭐

**Aapne kaha tha:** *"प्रत्येक ईएमआय भरण्याची इनव्हॉइस प्रिंट निघाली पाहिजे"* aur
*"ईएमआय भरल्याची प्रिंट कस्टमरला देताना किती पेंडिंग आहे हे दिसणे आवश्यक आहे."*

### Print nikalne ke 3 raaste

| Kab | Kahan se |
|---|---|
| Abhi-abhi hapta bhara | Green banner mein **Print receipt** |
| Kisi bhi purane hapte ki | Payments grid mein har row ke aakhir mein **Invoice** column (`INV-000001` jaisa button) |
| Sabse aakhri hapte ki | Customer page par upar **Invoice print** button |

Teeno mein se koi bhi dabao.

### ✅ Pavti par yeh sab hona chahiye — ek-ek karke check kijiye

| # | Cheez | Kya dikhna chahiye |
|---|---|---|
| 1 | Sabse upar | Aapki **branch ka naam**, address aur phone number |
| 2 | Pavti number | **Invoice INV-000001** (system ka apna number) |
| 3 | Aapka number | **Receipt book no. R-001** (jo aapne haath se bhara) |
| 4 | Customer | `A/c 3473`, `Ramesh Suresh Patil` |
| 5 | Pata | Wagholi, Lohegaon, Haveli, Pune |
| 6 | Mobile + gaadi | `9876543210 · Hero Splendor Plus` |
| 7 | Hapta | `Installment no. 1` aur tareekh |
| 8 | Paisa | Installment `₹5,000`, Penalty `₹500`, **TOTAL PAID `₹5,500`** |
| 9 | **⭐ Kitne baaki** | **`Paid 1 of 12`** aur bade akshar mein **`PENDING 11`** |
| 10 | Agli tareekh | **Next due** — agla hapta kab bharna hai |
| 11 | Sabse neeche | **Received by** aur **Customer signature** ki do lines |

### Ab actual print nikaliye

1. **Print receipt** button (ya keyboard par `Ctrl + P`) dabao
2. ✅ Print preview mein dekhiye:
   - **Ek hi A4 kaagaz par DO pavti** — upar **Office copy**, neeche
     **Customer copy**, beech mein katne ki dotted line.
     👉 Kaagaz beech se kaat kar **ek copy customer ko dijiye, ek apne paas
     rakhiye**.
   - Print mein app ka **neela header, menu aur buttons NAHI aane chahiye** —
     sirf saaf-suthri pavti.

### ⭐ Ek zaroori cheez — purani pavti dobara print karke dekhiye

Payments grid mein **pehle** hapte ka `INV-000001` button dabaiye.

✅ Us par abhi bhi **`Paid 1 of 12 · PENDING 11`** hi likha rahega — `Paid 2`
nahi, chahe aapne uske baad aur hapte bhar diye hon.

**Aisa jaan-bujh kar rakha hai:** pavti us din ka record hai. Jo pavti aapne
customer ko us din di thi, dobara nikalne par bhi bilkul wahi honi chahiye —
warna hisaab mein gadbad ho jayegi.

> **Printer ke baare mein:** yeh aapke normal A4 printer ke liye banaya hai — koi
> special billing machine kharidne ki zarurat nahi.

---

## Test 2 — 🆕 Hapta bharne ka option ab aasaani se milta hai

**Aapne kaha tha:** *"कस्टमर ईएमआय भरण्यासाठी आले की एंट्री करण्यास ऑप्शन असले
पाहिजे कारण ते ऑप्शन मिळत नाही आहे."*

Pehle yeh option customer ke andar tab mein chhupa hua tha. Ab **teen jagah** se
seedha pahunch sakte ho — teeno try kijiye:

### Raasta 1 — Customers list se seedha (sabse tez)

1. **Customers** kholo
2. ✅ Har customer ke card ke **neeche-daayein** ek **Record EMI** ka button hai
3. Dabao → ✅ seedha hapta bharne wale form par pahunch jaoge

### Raasta 2 — Customer ke page se

1. Kisi customer ko kholo
2. ✅ Upar hi ek bada neela **Record EMI payment** button dikhega
3. Dabao → ✅ form khul jayega

### Raasta 3 — Dashboard se

1. **Dashboard** kholo
2. ✅ **Record EMI Payment** naam ki nayi tile dikhegi (₹ ke nishaan ke saath)
3. Dabao → customers list khulegi, wahan se customer dhoondh lo

> Search box ke neeche ab likha hai: *"Search by name, account number, mobile, RC
> or engine number — then open the customer to record the EMI they came to pay."*

**Bataiye:** ab option aasaani se mil raha hai ya kahin aur bhi button chahiye?

---

## Test 3 — 🆕 Har page par Back button

**Aapne kaha tha:** *"प्रत्येक पेजमध्ये बॅक बटन असणे आवश्यक आहे."*

Ab har page ke **sabse upar bayein taraf** ek **Back** ka button hai. Yeh check
kijiye:

| Jahan aap ho | Back button par kya likha hoga |
|---|---|
| Customers list | **Back to Dashboard** |
| Kisi customer ka page | **Back to Customers** |
| Edit ka page | **Back to Customer** |
| Invoice / pavti ka page | **Back to Customer** |
| Print / khata ka page | **Back to Customer** |
| Owner → Branches | **Back to Dashboard** |
| **Dashboard (pehla page)** | ❌ **kuch nahi** — aur yahi sahi hai |

✅ Dashboard par button **jaan-bujh kar nahi** rakha — woh sabse pehla page hai,
uske peeche jaane ke liye kuch hai hi nahi.

✅ Phone par bhi check kijiye — button ungli se aaram se dabne layak bada hai.

---

## Test 6 — 🆕 Customer ki details Edit karo

**Aapne kaha tha:** *"आयडी लॉगिन केल्यानंतर कस्टमर पेजमध्ये एडिटचे ऑप्शन बटन..."*

Ab galti sudharne ke liye customer dobara banane ki zarurat nahi.

1. **Ramesh Patil** ka page kholo
2. Upar **Edit** button dabao
3. ✅ Wahi form khulega jo customer add karte waqt aata hai — lekin **sab kuch
   pehle se bhara hua**: naam, gaon, mobile, loan amount, hapta, tenure, dono
   dates, bank — sab.
4. Kuch badal kar dekho — jaise **Village** ko `Wagholi` se `Kesnand` kar do, aur
   **Mobile number 2** mein `9000000000` daal do
5. **Save changes** dabao

✅ **Kya hona chahiye:**
- Wapas customer ke page par, upar green banner **"Customer updated"**
- **Customer** tab mein nayi village aur naya mobile
- **EMI / Payments** tab mein jo hapte bhare thay woh **jaise ke waise** —
  ✋ **edit karne se paise ka record kabhi nahi badalta**

### Do galtiyan jaan-bujhkar karke dekhiye

| Kya karo | ✅ Kya hona chahiye |
|---|---|
| Account number badal kar kisi **doosre customer ka number** daal do (jaise `3001`) → Save | Red message: *"A customer with account number 3001 already exists"* — kuch save nahi hoga |
| **Tenure** `1` kar do (jabki 2 hapte bhare hain) → Save | System rok dega: *"Tenure cannot be less than the 2 installments already recorded"* |

Doosri wali isliye rakhi hai taaki *"Paid 2 of 1"* jaisa ulta-pulta record kabhi
na bane.

### Kaun edit kar sakta hai

| Role | Edit? |
|---|---|
| **Admin** | ✅ Haan |
| **Employee** | ✅ Haan — kai baar staff ko field se hi sudhaar karna padta hai |
| **Owner** | ❌ Nahi — Edit ka button hi nahi dikhega (Owner sirf dekhne ke liye hai) |
| **Sub-ID** | ❌ Nahi — woh sirf nayi entry karta hai |

> Har badlav system ke andar **record ho jata hai** — kisne, kab, kya badla. Yeh
> baad mein dekhne ki screen Phase 6 mein aayegi.

---

## Test 7 — 🆕 Customer ka poora khata print karo

Yeh **Invoice print** se **alag** hai — dono ka kaam alag hai:

| Button | Kya print hota hai | Kab kaam aata hai |
|---|---|---|
| **Invoice print** | **Ek hapte** ki chhoti pavti (A5, 2 copy) | Customer paisa de kar ja raha hai |
| **Print** | Customer ka **poora khata** (A4, 1 page) | Customer ko poora hisaab dikhana ho, bank ko dena ho, ya file mein lagana ho |

1. Customer ke page par upar **Print** button dabao
2. ✅ Ek saaf page khulega jismein:
   - Upar **branch ka naam** aur aaj ki tareekh
   - 4 box: **Installments paid**, **Pending**, **Months behind**, **Next due**
   - **Customer, Loan, Vehicle, Guarantor** — saari details
   - **Installment ledger** — ab tak ke **saare hapte** ek-ek row mein
     (date, mahina, hapta, penalty, total, cash/online, invoice no., receipt no.)
   - Sabse neeche **Total collected** (kul kitna paisa aaya)
   - Do signature lines
3. **Print statement** (ya `Ctrl + P`) dabao → ✅ preview mein app ka header, menu
   aur buttons nahi aane chahiye — sirf khata.

---

## Test 8 — Rang wale counts abhi bhi sahi hain?

Yeh purana feature hai, lekin ab ginti **First EMI date** se hoti hai — isliye ek
baar check kar lijiye ki kuch bigda toh nahi.

Header mein 4 rang ke counts hain: 🟢 🟡 🟠 🔴

**Ramesh ka hisaab:** purchase 5 mahine pehle → pehla hapta 4 mahine pehle due
hua → ab tak **5 hapte** bharne the → aapne **2** bhare → `5 − 2 = 3` peeche →
🟠 **Orange**.

1. Header ke counts dekho → ✅ Orange ka count 1 badha hona chahiye
2. 🟠 **Orange** pill par click karo → ✅ list mein Ramesh dikhega

> 🆕 **Naya:** agar aap kisi customer ki **First EMI date aage** kar do (jaise 2
> mahine baad), toh utne hapte "due" nahi maane jayenge aur uska rang bhi uske
> hisaab se badal jayega. Yeh Test 6 (Edit) se try karke dekh sakte ho.

---

## 📋 Wapas humein kya batana hai

Bas yeh table bhar kar bhej dijiye:

| # | Cheez | Theek hai? | Notes |
|---|---|---|---|
| 1 | EMI ki **invoice print** nikli? | Haan / Nahi | |
| 2 | Pavti par **PENDING** ki ginti sahi thi? | Haan / Nahi | |
| 3 | **Ek A4 par 2 copy** (Office + Customer) theek hai, ya kuch aur chahiye? | | |
| 4 | Pavti mein kuch **aur cheez** chahiye? (GST no., logo, terms, Marathi mein likha?) | | |
| 5 | **Record EMI** ka button ab aasaani se mil raha hai? | Haan / Nahi | |
| 6 | **Back button** har page par mila? | Haan / Nahi | |
| 7 | **First EMI date** apne aap sahi aa rahi hai? | Haan / Nahi | |
| 8 | **₹500 penalty** apne aap bharna theek hai, ya khaali box chahiye? | | |
| 9 | Bank ke naam (**Dhanshree / Bhagyalaxmi**) sahi hain? | Haan / Nahi | |
| 10 | **Edit** ka option theek chala? | Haan / Nahi | |
| 11 | **Employee ko bhi edit** dena theek hai, ya sirf Admin ko? | | |
| 12 | Poore khate ki **Print** theek lagi? | Haan / Nahi | |
| 13 | Phone par sab theek dikha? | Haan / Nahi | |

---

## Abhi jo baaki hai (agle round mein)

- **Poori automatic penalty** — abhi system ₹500 × late mahine ka **suggestion**
  deta hai aur aap confirm karte ho. Aage system khud lagayega.
- **Pending customer list** — 0 / 1 / 3 / 5 / Below 3 / Above 5 ke hisaab se
  filter
- **Bank Recovery lists**, **Daily Summary**, **Foreclosure & Seizure**,
  **Documents & Keys**

---

*Testing ke dauraan kuch galat lage — page load na ho, button kuch na kare, koi
error aaye, ya print theek na nikle — toh uska **screenshot** lekar bhej
dijiye. Chhoti si baat bhi humare liye kaam ki hai.*
