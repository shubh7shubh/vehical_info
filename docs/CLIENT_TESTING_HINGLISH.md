# Vehicle Finance — Client Testing Guide (Hinglish)

Namaste! Yeh guide aapko step-by-step batayegi ki system mein **abhi kya-kya test
kar sakte ho**. Koi technical knowledge ki zarurat nahi hai — bas ek internet
browser chahiye.

> Yeh guide aasaan Hinglish mein likhi gayi hai. Iska English version
> `docs/CLIENT_TESTING.md` mein hai — dono same flow follow karte hain.

---

## Aaj aapke paas kya hai

System **branches** ke around bana hai. Simple picture yeh hai:

- **Aap Owner ho.** Aap sabse upar baithte ho. Aap branches bana sakte ho, har
  branch ko uska apna manager de sakte ho, aur ek hi screen se dekh sakte ho ki
  har branch kaisa chal raha hai.
- **Har branch ka apna Admin hota hai.** Branch Admin sirf apni branch chalata
  hai: apne staff aur apne customers add karta hai.
- **Har branch private hai.** Ek branch doosri branch ke log, customers ya
  records nahi dekh sakti. Isse har branch ki information alag aur secure rehti
  hai.

Is round mein naya kya hai:

- Branch ke andar ab aap **customers add** kar sakte ho, **kisi bhi customer ko
  search** kar sakte ho, aur uska **poora customer card** khol sakte ho.
- Purani loan-book (bahi) ko jaldi se bharne ke liye ek alag **Sub-ID** account
  hota hai — woh sirf data entry karta hai.
- Har customer ke against aap har mahine ki **installment (hapta)** aur
  **follow-up notes** record kar sakte ho.
- Upar header mein **4 rang ke counts** dikhte hain (🟢 🟡 🟠 🔴) taaki staff ko
  pata chale kis customer ke peeche jaana hai.

---

## Har role kya kar sakta hai (aur uska login kahan test hota hai)

System mein **4 tarah ke log** hote hain. Sirf **Owner** ka account pehle se bana
hai — baaki teeno roles **aap khud** is guide ke dauraan banaoge, phir har ek se
login karke uske features test karoge. Niche poora picture:

| Role | Login is guide mein | Kya kar **sakta** hai | Kya **NAHI** kar sakta |
|---|---|---|---|
| **Owner** | **Test 1** — account pehle se ready (`client@vehiclefinance.in`) | Branches + unke Admin banana; sabhi branches ke totals aur 🟢🟡🟠🔴 ek screen par dekhna; kisi bhi branch ke andar **view-only** jhaankna | Khud customer/installment add nahi kar sakta — woh kaam branch ka staff karta hai (system-level par read-only) |
| **Admin** | **Test 5** — aap **Test 2** mein banate ho | Apni branch poori chalana: Employee/Sub-ID add karna, customers add + search, customer card, installment + follow-up record karna, reminder counts dekhna | Doosri branch ka kuch bhi nahi dekh sakta; Owner area nahi khol sakta |
| **Employee** | **Test 6** — aap banate ho | Apni branch mein customers add + search, customer card kholna, **installment + follow-up record karna**, reminder counts dekhna | **Admin → Users** panel nahi khol sakta (staff manage nahi kar sakta); doosri branch nahi dekh sakta |
| **Sub-ID** | **Test 13** — aap banate ho | Sirf ek **entry form** — purani bahi ke customers bulk add karna, apni di hui range tak | Na poori nav, na customer card, na installment — sirf entry; range khatam hote hi account **apne aap band** ho jata hai |

> **Login kaise karein (har role same):** website kholo → email + password daalo →
> **Sign in**. Alag-alag roles ek saath test karne ke liye har role ko ek **alag
> incognito / private window** mein kholo (taaki ek dusre se logout na karna pade).

---

## Shuru karne se pehle

Humari taraf se aapko milna chahiye:

- **Website:** https://vehical-info.vercel.app/

**🔑 Aapka Owner login (yahi se shuru karo):**

| | |
|---|---|
| **Email** | `client@vehiclefinance.in` |
| **Password** | `Client@2026` |

> Yeh **Owner** account hai — system ka sabse upar wala account. Baaki saare
> accounts (branch Admin, Employee, Sub-ID) **aap khud** in tests ke dauraan
> banaoge (Test 2, 6, 13), aur unka password aap apni marzi se rakhoge. Guide
> mein hum example ke taur par `Welcome123!` use kar rahe hain — aap chahe toh
> wahi rakho. Security ke liye baad mein in passwords ko badal sakte ho.

Link ko **Google Chrome** ya **Microsoft Edge** mein kholo — sabse smooth chalega.
Mobile par bhi chalega.

> Jab page load ho raha hota hai, sabse upar ek patli si moving line aur halka
> grey placeholder dikhta hai — yeh system bata raha hai ki woh kaam kar raha
> hai. Yeh normal hai, ghabraana nahi.

---

## Test data — ek hi customer pure guide mein use karo

Niche diye gaye **example values** copy-paste karke aage ke saare tests karo. Hum
ek hi dummy customer "Ramesh Patil" ko pehle add karenge, phir usi par
installment, follow-up aur rang waale tests karenge. Isse poora flow jud jata hai
aur aapko sochna nahi padega ki kya bharein.

> Yeh sab **nakli (dummy) data** hai sirf test ke liye. Test khatam hone ke baad
> hum inhe hata denge. Asli customer ka data abhi mat daalo.

**📋 Example customer (isko yaad rakho — aage baar-baar use hoga):**

| Field | Value |
|---|---|
| Account number | `3473` |
| First name | `Ramesh` |
| Middle name | `Suresh` |
| Surname | `Patil` |
| Village (gaon) | `Wagholi` |
| Post (पु.) | `Lohegaon` |
| Taluka | `Haveli` |
| District (जि.) | `Pune` |
| Mobile | `9876543210` |
| Model number | `Hero Splendor Plus` |
| Purchase date | **5 mahine pehle ki date** (niche samjhaaya hai) |
| Loan amount | `60000` |
| Installment (hapta) | `5000` |
| Tenure (kitne mahine) | `12` |
| Bank | jo list mein pehla aaye |

> **Purchase date kya daalein?** System customer ka rang (status) iss tareekh se
> ginta hai, toh testing ke liye hum date **peeche** rakhte hain taaki turant
> result dikhe — mahino ka intezaar na karna pade.
>
> - Aaj agar **June 2026** hai, toh "5 mahine pehle" matlab **January 2026** ki
>   koi tareekh (jaise `18 January 2026`).
> - Calendar mein bas mahina 5 ghata do.

---

## Test 1 — Owner ke roop mein sign in karo

1. https://vehical-info.vercel.app/ kholo
2. Aap apne-aap sign-in page par pahunch jaoge
3. Owner email `client@vehiclefinance.in` aur password `Client@2026` daalo
4. **Sign in** par click karo

✅ **Aapko kya dikhna chahiye:**
- **Owner Overview** naam ka page, upar right mein ek `owner` badge ke saath
- Summary boxes ki ek row: **Branches, Customers, Active loans, Staff**
- Ek simple navigation bar jismein sirf **Dashboard** aur **Branches** hai

---

## Test 2 — Apni pehli branch banao

Branch us insaan ke saath banti hai jo use manage karega (uska Admin).

> **Note:** System ke saath ek default **"Main Branch"** pehle se aata hai (yeh
> system ko chalane ke liye zaruri hai, isliye ise hata nahi sakte). Aap ise
> ignore kar sakte ho aur niche apni nayi branch bana sakte ho — ya chaho toh
> Main Branch ko hi use karke uspar **Add admin** kar lo. Test ke liye hum niche
> ek nayi branch banayenge.

1. Upar navigation mein **Branches** par click karo
2. **Create branch** form mein bharo:
   - Branch name: `Pune Branch`
   - Code (optional): `PUN`
   - City (optional): `Pune`
   - Branch admin email: `pune.admin@test.com`
   - Admin password: `Welcome123!`
3. **Create branch** par click karo

✅ Ek green confirmation banner aayega aur **Pune Branch** ka ek card dikhega,
jismein `pune.admin@test.com` uske Admin ke roop mein listed hoga.

---

## Test 3 — Doosri branch banao

Test 2 dohrao, ek aur branch banane ke liye:

- Branch name: `Mumbai Branch`
- Code: `MUM`
- City: `Mumbai`
- Branch admin email: `mumbai.admin@test.com`
- Admin password: `Welcome123!`

✅ **Mumbai Branch** ka doosra card dikhega.

---

## Test 4 — Saari branches ek nazar mein dekho

1. Upar navigation mein **Dashboard** par click karo

✅ Summary boxes **2 branches** count karenge, aur har branch apne
**Customers, Loans aur Staff** ke counts dikhayegi.

---

## Test 5 — Branch Admin ke roop mein sign in karo

1. Ek **naya incognito / private browser window** kholo
   (Chrome / Edge: Ctrl+Shift+N · Safari: Cmd+Shift+N)
2. https://vehical-info.vercel.app/ kholo
3. `pune.admin@test.com` / `Welcome123!` se sign in karo

✅ **Aapko kya dikhna chahiye:**
- Ek dashboard jismein upar ki taraf **Pune Branch** ka naam dikhe
- Ek `admin` badge (`owner` nahi)
- Navigation bar jismein **Dashboard, Customers, Pending, Bank Recovery,
  Daily Summary, Admin** ho

### Confirm karo ki Owner area protected hai

1. Yeh address haath se type karo: `https://vehical-info.vercel.app/dashboard/owner`
2. ✅ Aap wapas normal dashboard par bhej diye jaoge — Owner area sirf Owner hi
   khol sakta hai.

---

## Test 6 — Branch Admin Employee add karta hai (aur Employee se login)

### 6a. Employee account banao (Admin ke roop mein)

1. Pune Admin se signed in rehte hue, **Admin** par click karo → phir **Users**
   tile par click karo
2. ✅ Aapko sirf **Pune Branch** ka staff dikhega — abhi ke liye sirf Pune Admin
3. **Add user** form mein ek employee add karo:
   - Email: `pune.employee@test.com`
   - Password: `Welcome123!`
   - Role: `Employee`
4. **Add user** par click karo

✅ Ek green banner aayega aur naya employee list mein dikhega.

### 6b. Employee se login karke uske features aur limit dekho

1. Ek **naya incognito window** kholo → `pune.employee@test.com` / `Welcome123!`
   se sign in karo
2. ✅ Dashboard khulega; upar-right role badge **`employee`** dikhega (admin/owner
   nahi); upar **Pune Branch** ka naam dikhega
3. ✅ **Kya kar sakta hai:** nav mein **Customers** hai — employee customers add,
   search, aur kisi customer ke **EMI History** mein installment + follow-up
   record kar sakta hai (Test 7–11 employee se bhi chalte hain)
4. ✅ **Kya NAHI kar sakta:** nav mein **Admin** link **nahi** hai — employee
   staff manage nahi kar sakta
5. **Restriction khud test karo:** address bar mein haath se type karo
   `https://vehical-info.vercel.app/dashboard/admin/users` → ✅ aap wapas normal
   dashboard par bhej diye jaoge (employee ko Admin area allowed nahi)

> **Aage ke Test 7–12** aap **employee se** kar sakte ho (real istemaal aksar
> employee hi karta hai) ya wapas **Admin** se — dono allowed hain.

---

## Test 7 — Ek customer add karo

Branch Admin (ya Employee) apni branch mein customers add karta hai.

1. Pune Admin se signed in rehte hue, upar navigation mein **Customers** par
   click karo
2. **Add customer** par click karo
3. Form bharo. **\*** waale box zaruri hain. **Upar "Test data" wali table ke
   values copy karo:**

   **📋 Example — yeh bilkul yahi daalo:**

   | Box | Kya type karein |
   |---|---|
   | Account number * | `3473` |
   | First name * | `Ramesh` |
   | Middle name | `Suresh` |
   | Surname | `Patil` |
   | Village | `Wagholi` |
   | Post | `Lohegaon` |
   | Taluka | `Haveli` |
   | District | `Pune` |
   | Mobile | `9876543210` |
   | Model number | `Hero Splendor Plus` |
   | Purchase date * | 5 mahine pehle ki date (jaise `18-01-2026`) |
   | Bank * | list ka pehla bank |
   | Loan amount * | `60000` |
   | Installment (hapta) * | `5000` |
   | Tenure * | `12` |

   - **Vehicle aur Guarantor details** ek collapse hone wale section
     ("Vehicle / Guarantor") ke andar hain aur **optional** hain — test ke liye
     inhe khaali chhod sakte ho, ya kholkar vehicle name / RC number bhar sakte
     ho.
4. **Save customer** par click karo

✅ **Aapko kya dikhna chahiye:**
- Aap seedhe **Ramesh Patil** ke page par chale jaoge jismein account `3473` aur
  sab details dikhengi.

### Do cheezein try karo (galti jaan-bujhkar karo)

- **Duplicate account number:** dobara **Add customer** kholo aur phir se account
  number `3473` daalo (naam kuch bhi rakho, jaise `Test Duplicate`). Save karo.
  ✅ System rok dega ek red message ke saath: *"A customer with account number
  3473 already exists"*, aur kuch bhi aadha-adhura save nahi hoga.
- **Doosri branch mein wahi number:** baad mein jab Mumbai Admin se login karo
  (Test 14), wahi account `3473` Mumbai mein add karke dekho. ✅ Yeh **allowed**
  hai — har branch apni alag loan-book rakhti hai, isliye Pune aur Mumbai dono ke
  paas apna `3473` ho sakta hai.

---

## Test 8 — Search se customer dhoondo

1. **Customers** par jao (ya dashboard ke search box ka use karo)
2. Inmein se koi bhi type karke **Search** par click karo:
   - customer ke naam ka hissa
   - **account number**
   - vehicle ka RC number
   - engine number
   - mobile number
   - Aadhaar number

✅ Matching customers dikhenge. Agar do customers ke naam milte-julte hain, dono
apne gaon aur mobile number ke saath dikhenge taaki aap unhe alag pehchaan sako.

---

## Test 9 — Customer ka poora card kholo

1. List ya search results se kisi bhi customer par click karo

✅ **Aapko kya dikhna chahiye:**
- Customer ka poora card jismein upar tabs hon: **Customer, Vehicle, Guarantor,
  Loan, EMI History, Foreclosure / Seizure, Documents & Keys**
- Header mein customer ka **account number** aur ek **rang ka badge** (status)
- **Customer, Vehicle, Guarantor aur Loan** tabs woh details dikhayenge jo aapne
  bhari thi. Baaki tabs aage features ke saath bharte jayenge.
- Phone par tab strip side mein slide hoti hai taaki har tab tak pahuncha ja sake.

---

## Test 10 — Installment (hapta) record karo

Yeh system ka dil hai — physical bahi ki tarah, har mahine ka hapta yahin likhte
hain.

1. Employee (ya Admin) ke roop mein → **Customers** → search box mein
   `3473` (ya `Ramesh`) type karke search karo → **Ramesh Patil** kholo →
   **EMI History** tab par jao
2. ✅ Is tab par dikhega: ek status badge, **"Paid X of Y"** (kitne hapte bhar
   diye / kitne due hain), ek **Add installment** form, ek **payments grid**
   (Sr / Date / Month / Installment / Penalty / Total / Receipt / Sign) aur ek
   **Follow-ups** log
3. **Add installment** form bharo —

   **📋 Example — pehla hapta:**

   | Box | Kya daalein |
   |---|---|
   | Month number | `1` |
   | Date | aaj ki tareekh |
   | Installment amount | `5000` (apne aap EMI aa jaata hai) |
   | Penalty | `0` (ya `100` agar late aaya tha) |
   | Receipt number | `R-001` |
   | Mode | `Cash` |
   | Signature | tick karo (✓) |

   Save karo. ✅ Green banner aayega; payments grid mein ek row dikhegi jismein
   **Total = 5000 + 0 = 5000** (ya penalty daali toh `5000 + 100 = 5100`);
   "Paid 1 of 12" dikhega.
4. **Ek aur hapta add karke dekho** — Month number `2`, amount `5000`, receipt
   `R-002`. ✅ Ab "Paid 2 of 12" ho jayega aur grid mein 2 rows dikhengi.

> **Note:** Penalty abhi haath se daalni hai (jaise bahi mein likhte ho).
> Automatic penalty calculation baad wale update mein aayega.

---

## Test 11 — Follow-up note add karo

Jab aap customer ke peeche jaate ho (phone / visit), woh baat yahan likh lo.

1. Usi **EMI History** tab par, **Follow-ups** section ke box mein ek note likho.

   **📋 Example notes (ek-ek karke add karo):**
   - `Phone kiya — 20 tareekh ko paisa dene ka bola hai`
   - `Ghar gaye the, ghar par nahi mile`
   - `Aaj 2000 cash diya, baaki agle hafte`

2. har note ke baad **Add** par click karo

✅ Har note timestamp (date-time) ke saath dikhega. Teeno notes add karne ke baad,
✅ sabse naya note (`Aaj 2000 cash diya…`) sabse **upar** dikhega — newest pehle.

---

## Test 12 — Header ke rang waale counts (reminder triage)

Yeh 4 pills batate hain kis customer ke peeche jaana hai — bilkul ek shopping
cart ke number ki tarah.

- 🟢 **Green** — on time (koi hapta due nahi)
- 🟡 **Yellow** — 1–2 hapte peeche
- 🟠 **Orange** — 3 hapte peeche
- 🔴 **Red** — 3 se zyada hapte peeche

**Yeh kaise kaam karta hai (asaan example):** Ramesh ki purchase date **5 mahine
pehle** thi, matlab ab tak **5 hapte** bharne the. Aapne abhi **2 hapte** bhare
(Test 10 mein). Toh woh `5 − 2 = 3` hapte peeche hai → 🟠 **Orange**.

**📋 Har rang khud banakar dekho** — 5 mahine purani purchase date waale alag-alag
dummy customers banao aur utne hapte log karo:

| Rang chahiye | Purchase date | Kitne hapte log karo |
|---|---|---|
| 🟢 Green (time par) | 5 mahine pehle | 5 |
| 🟡 Yellow (1–2 peeche) | 5 mahine pehle | 3 |
| 🟠 Orange (3 peeche) | 5 mahine pehle | 2 |
| 🔴 Red (3 se zyada) | 5 mahine pehle | 1 (ya 0) |

1. Upar table ke hisaab se 4 dummy customers banao (account `3001`, `3002`,
   `3003`, `3004` — alag-alag), har ek ko utne hapte do.
2. Header (mobile par header ke neeche wali row) mein 4 pills dekho — yeh sirf
   **aapki branch** ke counts hain. ✅ Har rang ka count badhega.
3. 🔴 **Red** pill par click karo → ✅ Customers list sirf red customers dikhayegi
   (jaise `3004`); har row apna rang badge + account number bhi dikhati hai.
   **Clear** se filter hat jata hai.
4. `3004` (red) kholo aur uske `5` hapte poore log kar do (catch-up) → page reload
   karo → ✅ woh 🟢 green ho jata hai aur header ke counts shift ho jaate hain.

> **Testing ke liye time ka intezaar nahi karna padega.** Customer ka rang
> **purchase date** aur aaj ki tareekh se nikalta hai — isliye purchase date
> peeche rakhne se turant result dikh jaata hai, mahino ka intezaar nahi.

---

## Test 13 — Sub-ID se purani bahi bulk-enter karo

Sub-ID ek temporary data-entry account hai purani record-books bharne ke liye.

1. Branch Admin ke roop mein → **Admin → Users** → ek Sub-ID add karo:

   **📋 Example sub-ID account:**

   | Box | Value |
   |---|---|
   | Email | `pune.entry@test.com` |
   | Password | `Welcome123!` |
   | Role | `Sub-ID` |
   | Range start | `1` |
   | Range end | `5` (chhota rakho taaki "range full" test jaldi ho jaaye) |

2. Us Sub-ID (`pune.entry@test.com`) se ek naye incognito window mein sign in
   karo → ✅ dashboard ab ek **loan-book entry form** dikhayega plus ek live
   **Entered / Remaining** progress strip (jaise `Entered 0 / Remaining 5`). Koi
   badi nav ya tiles nahi — sirf entry ka kaam.
3. Ek customer add karo —

   **📋 Example (purani bahi ki ek line):**

   | Box | Value |
   |---|---|
   | Account number | `7001` |
   | First name | `Sunil` |
   | Surname | `More` |
   | Village | `Hadapsar` |
   | Mobile | `9123456780` |
   | Model number | `Bajaj Pulsar` |
   | Purchase date | koi bhi pichhli tareekh |
   | Loan amount | `45000` |
   | Installment | `4000` |
   | Tenure | `12` |

   ✅ Green "Added account 7001 — …" banner; progress `Entered 1 / Remaining 4`
   ho jata hai.
4. **Duplicate test:** dobara account number `7001` daalkar save karo → ✅ red
   banner *"A customer with account number 7001 already exists"*; kuch save nahi
   hota.
5. **Range cap test:** alag-alag account numbers (`7002`, `7003`, `7004`, `7005`)
   se 4 aur customers add karo. Jab `Entered 5 / Remaining 0` ho jaaye, ek aur
   (`7006`) add karne ki koshish karo → ✅ *"sub-id range exhausted"* (range
   khatam — yeh sub-ID account ab band ho jata hai).

---

## Test 14 — Branches alag-alag rehti hain

1. Ek aur incognito window kholo aur **Mumbai** Admin se sign in karo
   (`mumbai.admin@test.com` / `Welcome123!`)
2. **Admin → Users** par jao → ✅ sirf Mumbai staff dikhega; Pune ke log
   (`pune.admin@test.com`, `pune.employee@test.com`) kahin nahi.
3. **Customers** par jao aur `3473` ya `Ramesh` search karo (jo aapne Pune mein
   add kiya tha) → ✅ koi result nahi. Ek branch doosri branch ke customers nahi
   dekh sakti.
4. **Wahi number, alag branch (allowed):** Mumbai mein **Add customer** karke
   account number `3473` daalo (naam `Mumbai Ramesh`, purchase date, loan, etc.)
   → ✅ yeh **save ho jata hai**. Pune ka `3473` aur Mumbai ka `3473` alag-alag
   hain — har branch apni loan-book rakhti hai.

---

## Test 15 — Owner kisi bhi branch ke andar dekh sakta hai

1. Wapas apne **Owner** window mein, **Dashboard** par jao
2. **Pune Branch** card par click karo

✅ Pune Branch ka detail view khulega — uske totals, staff list, aur recent
activity. Har branch card uske **🟢 🟡 🟠 🔴 buckets** bhi dikhata hai. Yeh ek
**view-only** screen hai: Owner branches par nazar rakhta hai, jabki rozmarra ka
kaam har branch ka apna Admin aur staff karta hai.

---

## Test 16 — Branch mein doosra Admin add karo

Ek branch safely ek se zyada Admin rakh sakti hai (jab ek chutti par ho toh kaam
aata hai).

1. Owner ke roop mein, **Branches** par jao
2. **Pune Branch** card par, **Add admin** box ka use karo:
   - Email: `pune.admin2@test.com`
   - Password: `Welcome123!`
3. **Add admin** par click karo

✅ Naya admin Pune Branch ke Admins list ke neeche dikhega.

> **Safety guardrail:** jab tak branch mein sirf ek Admin hai, woh Admin khud ko
> remove ya disable nahi kar sakta. Doosra Admin aane ke baad yeh allowed ho jata
> hai.

---

## Test 17 — Ek branch archive karo

Agar koi branch band ho jaaye, aap use archive kar sakte ho (yeh use chhupa deta
hai bina kuch khoye).

1. Owner ke roop mein, **Branches** par jao
2. Kisi test branch card par, **Archive** par click karo

✅ Card par **Archived** label dikhega. **Restore** par click karne se woh wapas
aa jaati hai.

---

## Test 18 — Sign out karo

1. Upar-right corner mein **Sign out** par click karo

✅ Aap wapas login page par aa jaoge.

---

## Wapas humein kya batana hai

Please humein bataiye:

| Item | Status |
|---|---|
| Kya aapko working Owner credentials mile? | Haan / Nahi |
| Kya aap branches unke admins ke saath bana paaye? | Haan / Nahi |
| Kya aap chaaro roles (Owner / Admin / Employee / Sub-ID) se login karke unke features dekh paaye? | Haan / Nahi |
| Kya role restrictions sahi lage (Employee ko Admin area na mile, branch isolation)? | Haan / Nahi |
| Kya aap branch mein customers add aur search kar paaye? | Haan / Nahi |
| Kya aap installment aur follow-up record kar paaye? | Haan / Nahi |
| Kya header ke 🟢 🟡 🟠 🔴 counts sahi lage? | Haan / Nahi |
| Kya har branch sirf apna hi staff aur customers dekh paayi? | Haan / Nahi |
| Kya saare 18 tests pass hue? | Haan / Nahi |
| Kuch aisa jo guide ke hisaab se kaam nahi kiya? | (notes) |
| Kuch screen confusing ya samajh na aane wali lagi? | (notes) |
| Phone par screens theek fit hui aur chali? | Haan / Nahi |

---

## Aage kya aa raha hai

Agle kuch din mein, **har branch ke andar** yeh aayega:

- **Automatic penalty** — hapta log karne par grace period ke baad system khud
  penalty laga dega
- **Pending customer list** — 0 / 1 / 3 / 5 / Below 3 / Above 5 overdue hapton ke
  hisaab se filter
- **Bank Recovery lists** — har partner bank ke liye ek, rang ke hisaab se
- **Daily Summary** — din ke end ka cash + online collection, totals, pending
- **Foreclosure & Seizure** — loan jaldi band karne ka calculator aur gaadi
  seize karne ki entry
- **Documents & Keys** — physical handover status track karna

Har naye piece ke liye aapko ek updated test guide milegi.

---

*Agar testing ke dauraan kuch galat ho — page load na ho, button kuch na kare,
koi error message aaye — please uska screenshot lekar humein bhej dijiye. Chhoti
si problem bhi humare liye useful hoti hai.*
