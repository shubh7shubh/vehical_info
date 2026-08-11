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

System mein kya-kya hai:

- Branch ke andar aap **customers add** kar sakte ho, **kisi bhi customer ko
  search** kar sakte ho, aur uska **poora customer card** khol sakte ho.
- Purani loan-book (bahi) ko jaldi se bharne ke liye ek alag **Sub-ID** account
  hota hai — woh sirf data entry karta hai.
- Har customer ke against **hapta**, **penalty** aur **follow-up notes** record
  hote hain.
- Upar header mein **4 rang ke counts** dikhte hain (🟢 🟡 🟠 🔴) taaki staff ko
  pata chale kis customer ke peeche jaana hai.
- **Foreclosure aur Seizing** ka alag page hai.

### ✨ Aapke pichle feedback par jo kaam hua (yeh zaroor test karo)

Aapki **15 recordings** ka kaam poora ho gaya hai:

> 📄 **Sirf naye changes test karne hain?** Uske liye ek alag chhoti guide hai:
> **`docs/CLIENT_TESTING_NEW_CHANGES_HINGLISH.md`** — usme sirf naya kaam hai,
> poora system dobara test karne ki zarurat nahi.

| Aapne kaha | Ab system mein | Kahan test karein |
|---|---|---|
| Customer **kam paisa** de toh baaki balance dikhe | Ek hi **"Amount received"** box — system khud penalty aur hapte mein baant deta hai, aur baaki balance batata hai | Test 10 |
| **Sirf penalty** bharne ka alag option | **"Pay penalty only"** ka alag box | Test 10b |
| Penalty **kam-zyada** karna sirf Owner/Admin | **Penalty ledger** — sirf Admin badal ya maaf kar sakta hai | Test 10b |
| Instalment register mein **Remark** | Har entry par Remark ka box aur grid mein column | Test 10 |
| Pavti ka number **apne aap** bane | **Receipt No. INV-000001** — system khud banata hai | Test 10a |
| Print par **First EMI date** | Pavti par customer ke naam ke neeche | Test 10a |
| Print par **total baaki** aur **aaj kitna liya** | Pavti par **Total paid today** aur **Total outstanding** | Test 10a |
| Print par **poora hisaab** | EMI diya, EMI balance, penalty diya, penalty balance, kaunsa mahina baaki | Test 10a |
| **Foreclosure aur Seizing** ka alag page | Naya **Foreclosure** page — loan number se search | Test 20a |
| Foreclosure sirf **6 mahine** ke baad | 6 mahine se kam wale ka button **band** rehta hai | Test 20a |
| Seizing mein search + **Add Seizing** | Usi page par Seizing ka box | Test 20b |
| Saara paisa bharne par **Exit Seizing** | Paisa baaki ho toh system rok deta hai | Test 20b |
| Seizing hataana sirf Owner/Admin | Employee ka button band rehta hai | Test 20b |
| Har EMI ki **invoice print** | Ek A5 pavti (ek kaagaz par 2 copy) | Test 10a |
| Hapta bharne ka **option nahi mil raha tha** | **Record EMI** ka button teen jagah | Test 10 |
| Har page par **Back button** | Har page ke upar **Back** | Test 18 |
| Print par **kitne hapte baaki** | **"Paid 2 of 12 · PENDING 10"** | Test 10a |
| Loan date daalte hi **First EMI date** | Apne aap bhar jati hai | Test 7 |
| Penalty **mahine ka ₹500** | System **khud** lagata hai, har late mahine ke liye | Test 10b |
| Bank ke naam **Dhanshree** / **Bhagyalaxmi** | Bank list mein yahi do naam | Test 7 |
| Customer page par **Edit / Print / Invoice Print** | Teeno button | Test 10a, 19, 20 |

---

## Har role kya kar sakta hai (aur uska login kahan test hota hai)

System mein **4 tarah ke log** hote hain. Sirf **Owner** ka account pehle se bana
hai — baaki teeno roles **aap khud** is guide ke dauraan banaoge, phir har ek se
login karke uske features test karoge. Niche poora picture:

| Role | Login is guide mein | Kya kar **sakta** hai | Kya **NAHI** kar sakta |
|---|---|---|---|
| **Owner** | **Test 1** — account pehle se ready (`client@vehiclefinance.in`) | Branches + unke Admin banana; sabhi branches ke totals aur 🟢🟡🟠🔴 ek screen par dekhna; kisi bhi branch ke andar **view-only** jhaankna | Khud customer/installment add ya **edit** nahi kar sakta — woh kaam branch ka staff karta hai (system-level par read-only) |
| **Admin** | **Test 5** — aap **Test 2** mein banate ho | Apni branch poori chalana: Employee/Sub-ID add karna, customers add + search + **edit**, customer card, installment + follow-up record karna, **pavti aur khata print karna**, reminder counts dekhna | Doosri branch ka kuch bhi nahi dekh sakta; Owner area nahi khol sakta |
| **Employee** | **Test 6** — aap banate ho | Apni branch mein customers add + search + **edit**, customer card kholna, **installment + follow-up record karna**, **pavti aur khata print karna**, reminder counts dekhna | **Admin → Users** panel nahi khol sakta (staff manage nahi kar sakta); doosri branch nahi dekh sakta |
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
| Purchase / loan date | **5 mahine pehle ki date** (niche samjhaaya hai) |
| First EMI date | **kuch mat karo — apne aap bhar jayega** |
| Loan amount | `60000` |
| Installment (hapta) | `5000` |
| Tenure (kitne mahine) | `12` |
| Bank | `Dhanshree Bank` |

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
   | Purchase / loan date * | 5 mahine pehle ki date (jaise `18-01-2026`) |
   | First EMI date * | **haath se mat bharo** — dekho niche kya likha hai |
   | Bank * | `Dhanshree Bank` |
   | Loan amount * | `60000` |
   | Installment (hapta) * | `5000` |
   | Tenure * | `12` |

   - **Vehicle aur Guarantor details** ek collapse hone wale section
     ("Vehicle / Guarantor") ke andar hain aur **optional** hain — test ke liye
     inhe khaali chhod sakte ho, ya kholkar vehicle name / RC number bhar sakte
     ho.

   ### 🆕 First EMI date apne aap aati hai
   Jaise hi aap **Purchase / loan date** daaloge, uske bagal wala
   **First EMI date** ka box **apne aap bhar jayega** — theek **ek mahina baad**
   ki tareekh. Neeche chhote akshar mein likha aayega *"Filled automatically —
   one month after the purchase date."*

   ✅ **Yeh do cheezein try karo:**
   - Purchase date badal kar dekho → First EMI date bhi apne aap khisak jayegi.
   - First EMI date **khud badal do** (jaise 10 din aage) → ab woh likha aayega
     *"Set by hand"* aur woh apne aap nahi badlegi. Wapas automatic chahiye toh
     **Reset to automatic** par click karo.

   ### 🆕 Bank ke naam
   ✅ Bank ki list mein ab **Dhanshree Bank** aur **Bhagyalaxmi Bank** dikhne
   chahiye (pehle "Bank A" / "Bank B" thay).

4. **Save customer** par click karo

✅ **Aapko kya dikhna chahiye:**
- Aap seedhe **Ramesh Patil** ke page par chale jaoge jismein account `3473` aur
  sab details dikhengi.
- Upar ek **button ki line** dikhegi: **Record EMI payment · Edit · Print ·
  Invoice print**.
- **Loan** tab kholo → ✅ wahan **First EMI date** aur
  **Penalty: Monthly fixed · ₹500** dikhega.

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
  Loan, EMI / Payments, Foreclosure / Seizure, Documents & Keys**
- Header mein customer ka **account number** aur ek **rang ka badge** (status)
- Tabs ke upar **4 button**: **Record EMI payment**, **Edit**, **Print**,
  **Invoice print** (Invoice print tabhi dikhta hai jab kam se kam ek hapta
  bhara ho)
- **Customer, Vehicle, Guarantor aur Loan** tabs woh details dikhayenge jo aapne
  bhari thi. Baaki tabs aage features ke saath bharte jayenge.
- Phone par tab strip side mein slide hoti hai taaki har tab tak pahuncha ja sake.

---

## Test 10 — Installment (hapta) record karo

Yeh system ka dil hai — physical bahi ki tarah, har mahine ka hapta yahin likhte
hain.

### 🆕 Hapta bharne ka option ab 3 jagah hai

Aapne kaha tha ki hapta bharne ka option milta nahi hai. Ab **teen** raaste hain
— teeno try karke dekho:

1. **Customers list se seedha:** **Customers** kholo → har customer ke card ke
   neeche-daayein **Record EMI** ka button hai → click karo, seedhe hapta bharne
   wale form par pahunch jaoge.
2. **Customer ke page se:** customer kholo → upar **Record EMI payment** ka neela
   button.
3. **Dashboard se:** Dashboard par **Record EMI Payment** naam ki nayi tile hai →
   click karke customer search karo.

### Hapta record karo

1. Employee (ya Admin) ke roop mein → **Customers** → search box mein
   `3473` (ya `Ramesh`) type karke search karo → **Ramesh Patil** ke card par
   **Record EMI** click karo
2. ✅ Is tab par dikhega: ek status badge, **"Paid X of Y · Z pending"**,
   **Next due** tareekh, ek **balance ka box**, hapta bharne ka form, ek
   **payments grid** (Sr / Date / Month / Instalment / Penalty / Total /
   **Remark** / Book no. / Sign / **Receipt no.**), ek **Penalty ledger** aur ek
   **Follow-ups** log

### 🆕 Pehle balance ka box dekho

Ramesh 5 mahine se ek bhi hapta nahi bhara, isliye upar chaar number dikhenge:

| Box | Kya dikhega |
|---|---|
| Balance on EMI #1 | **₹5,000** |
| EMI overdue | **₹25,000** |
| Penalty balance | **₹2,000** |
| **Total outstanding** | **₹62,000** |

> Penalty ₹2,000 kyun? **4 hapte** apni tareekh (+2 din) nikal chuke hain,
> ₹500 × 4 = ₹2,000. Paanchwa hapta abhi-abhi due hua hai, uspe abhi penalty
> nahi. System yeh **khud** lagata hai — aapko likhna nahi padta.

### 🆕 Ab hapta bharo — sirf ek box

Pehle alag-alag box the. Ab **sirf ek box** hai: **Amount received**.

3. **Amount received** mein `3000` daalo (jaan-bujh kar poora nahi)

   ✅ Neeche **apne aap** ban jayega:
   - **Towards penalty ₹2,000**
   - **Towards instalment ₹1,000**

   ✅ Aur uske neeche **abhi ka hisaab** dikhega:

   | | |
   |---|---|
   | Instalments settled | **0 of 12** |
   | Balance on EMI #1 | **₹4,000** |
   | Penalty balance | **₹0** |
   | **Total outstanding** | **₹59,000** |

   **Yeh sabse zaroori baat hai:** ₹1,000 dene se hapta **poora nahi hua**,
   isliye "0 of 12" hi rahega aur ₹4,000 **balance** ban gaya.

   ✅ Split ke dono box **aap khud bhi badal sakte ho** — ek badloge toh doosra
   apne aap adjust ho jayega. Wapas automatic karna ho toh **Reset to
   automatic** dabao.

4. Baaki bharo — **Date** aaj ki, **Mode** `Cash`, **Book no.** `R-001`,
   **Remark** `Aadha paisa, baaki agle hafte`, **Signature taken** tick ✓
5. **Record instalment** dabao

   ✅ Green banner **"Instalment recorded"** + bagal mein **Print receipt** ka
   button (yeh Test 10a hai). Grid mein row aa jayegi, jismein **Remark** ka
   column bhi hai.

6. **Ab baaki paisa daalo** — **Amount received** mein `4000` → poora
   instalment mein jayega (penalty ab ₹0 hai)

   ✅ **Ab "Paid 1 of 12"** ho jayega!

   **Do entry hui, lekin hapta ek hi gina gaya.** Pehle system har entry ko ek
   pura hapta maanta tha — ab woh **paise se ginta hai**, isliye hisaab hamesha
   sahi rehta hai.

---

## Test 10a — 🆕 EMI ki pavti (invoice) print karo

Yeh aapki sabse badi demand thi — har hapte ki print customer ko dene ke liye.

### Turant print (hapta bharne ke baad)

1. Hapta save karne ke baad jo green banner aaya tha, usmein **Print receipt**
   par click karo.

### Purane hapte ki print

- **Kisi bhi row ki:** payments grid mein har row ke aakhir mein **Receipt no.**
  column hai jismein `INV-000001` jaisa button hai → click karo.
- **Sabse aakhri hapte ki:** customer ke page par upar **Invoice print** button.

### ✅ Print page par kya dikhna chahiye

Test 10 wali **pehli** pavti (₹3,000 wali) kholiye aur ek-ek karke check kijiye:

| # | Cheez | Kya likha hoga |
|---|---|---|
| 1 | Sabse upar | Aapki **branch ka naam**, address aur phone |
| 2 | 🆕 Pavti number | **Receipt No. INV-000001** — system ne **khud** banaya |
| 3 | Aapka number | **Book no. R-001** (jo aapne haath se bhara) |
| 4 | Customer | `A/c 3473`, `Ramesh Suresh Patil`, gaon-post-taluka-zilla, mobile, model |
| 5 | 🆕 **First EMI date** | Naam ke neeche — `Date … · EMI ₹5,000 · First EMI …` |
| 6 | 🆕 Aaj ka EMI | `Instalment no. 1` → **₹1,000** |
| 7 | 🆕 EMI ka balance | `Balance on EMI #1` → **₹4,000** |
| 8 | 🆕 Aaj ki penalty | `Penalty paid` → **₹2,000** |
| 9 | 🆕 Penalty balance | **₹0** |
| 10 | 🆕 **Aaj kul kitna liya** | `Total paid today` → **₹3,000** |
| 11 | 🆕 **Kul kitna baaki** | `Total outstanding` → **₹59,000** |
| 12 | Kitne baaki | **`Paid 0 of 12`** aur **`PENDING 12`** |
| 13 | Agli tareekh | **Next due** |
| 14 | 🆕 Remark | `Aadha paisa, baaki agle hafte` |
| 15 | Sabse neeche | **Received by** aur **Customer signature** ki do lines |

1. **Print receipt** (ya `Ctrl + P`) dabao
2. ✅ Print preview mein dekho:
   - Ek hi A4 kaagaz par **do pavti** — upar **Office copy**, neeche
     **Customer copy**. Beech mein katne ki dotted line. Kaagaz kaat kar ek copy
     customer ko do, ek apne paas rakho.
   - Print mein app ka **neela header, menu aur buttons nahi aane chahiye** —
     sirf pavti.
3. **⭐ Purani pavti dobara print karke dekho:** doosri pavti kholo, phir wapas
   **pehli** wali kholo → ✅ us par **abhi bhi wahi purane number** honge —
   `Balance on EMI #1 = ₹4,000`, `Total paid today = ₹3,000`.

   Kyunki pavti **us din ka record** hai. Jo kaagaz customer ko us din diya tha,
   dobara nikalne par bilkul wahi nikalna chahiye — warna hisaab mein gadbad ho
   jayegi. Yeh jaan-bujh kar aisa rakha hai.

> **Printer ke baare mein:** yeh normal A4/A5 printer ke liye banaya hai jo aapke
> paas pehle se hai — koi special machine ki zarurat nahi.

---

## Test 10b — 🆕 Penalty ka ledger, aur sirf penalty bharna

### Penalty ka poora hisaab dikhta hai

**EMI / Payments** tab mein neeche **Penalty ledger** ka box hai.

✅ Har late mahine ka alag row dikhega:

| Month | Period | Source | Charged |
|---|---|---|---|
| 1 | (tareekh) | Automatic | ₹500 |
| 2 | (tareekh) | Automatic | ₹500 |
| 3 | (tareekh) | Automatic | ₹500 |
| 4 | (tareekh) | Automatic | ₹500 |

Neeche likha hoga:
> *"A penalty of ₹500 is charged automatically for every instalment still short
> 2 days after it falls due."*

### 🆕 Penalty badalna — sirf Admin

**Admin se login** karke dekhiye — har row ke aage ek **box aur do button**:

1. Pehle row ka `500` badal kar `300` kar do → **Save**
   ✅ Banner "Penalty updated", penalty balance ₹200 kam
2. Usi row par **Waive** dabao
   ✅ Row par line lag jayegi, balance aur ₹300 kam
   ✅ **Restore** se wapas aa jayega

**⚠️ Ab Employee se login karke wahi customer kholiye:**
✅ Employee ko box aur button **dikhne hi nahi chahiye** — sirf list, aur neeche
likha hoga *"Only a branch admin can change or waive a charge."*

### 🆕 Sirf penalty bharna

Jab penalty balance ₹0 se zyada ho, tab **"Pay penalty only"** naam ka alag box
dikhta hai.

1. **Amount received** mein `500` daalo (poori penalty nahi, aadhi)
2. ✅ Poora ₹500 **penalty** mein jayega, instalment ₹0
3. **Record penalty payment** dabao

✅ Banner **"Penalty payment recorded"**, penalty balance kam ho jayega, aur
**hapte ki ginti bilkul nahi badlegi**.
✅ Us pavti par upar **"Penalty Receipt"** likha aayega (EMI Receipt nahi).

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
pehle** thi, toh uska **pehla hapta 4 mahine pehle** due hua tha (purchase + 1
mahina). Us hisaab se ab tak **5 hapte** bharne the. Aapne abhi **2 hapte** bhare
(Test 10 mein). Toh woh `5 − 2 = 3` hapte peeche hai → 🟠 **Orange**.

> Ab yeh ginti **First EMI date** se hoti hai. Agar aap kisi customer ko First
> EMI date aage kar do (jaise 2 mahine baad), toh utne hapte "due" nahi maane
> jayenge aur uska rang bhi uske hisaab se badlega.

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

## Test 18 — 🆕 Har page par Back button

Aapne kaha tha ki har page mein back button hona chahiye.

1. Kisi bhi role se login karo
2. **Customers** kholo → ✅ page ke sabse upar **Back to Dashboard** ka button
3. Kisi customer ko kholo → ✅ **Back to Customers**
4. Us customer par **Edit** dabao → ✅ **Back to Customer**
5. **Invoice print** dabao → ✅ **Back to Customer** (pavti se seedha customer
   par, beech mein kahin nahi)
6. **Dashboard** par jao → ✅ yahan Back button **nahi** dikhega — yeh sabse
   pehla page hai, iske peeche kuch hai hi nahi. Yeh sahi hai.

✅ Owner ke area mein bhi check karo: **Branches** → kisi branch par click →
**Back to Branches**.

> Back button phone par bhi utna hi bada hai ki ungli se aaram se dab jaye.

---

## Test 19 — 🆕 Customer ki details Edit karo

Ab galti sudharne ke liye record dobara banane ki zarurat nahi.

1. Employee (ya Admin) se → **Customers** → **Ramesh Patil** kholo
2. Upar **Edit** button par click karo
3. ✅ Wahi form khulega jo customer add karte waqt aata hai, lekin **sab kuch
   pehle se bhara hua** — naam, gaon, mobile, loan amount, hapta, tenure, dates,
   bank, sab.
4. Kuch badal ke dekho — jaise **Village** ko `Wagholi` se `Kesnand` kar do, aur
   **Mobile number 2** mein `9000000000` daal do
5. **Save changes** par click karo

✅ **Aapko kya dikhna chahiye:**
- Aap wapas customer ke page par aa jaoge, upar green banner **"Customer
  updated"**
- **Customer** tab mein nayi village aur naya mobile dikhega
- **EMI / Payments** tab mein jo hapte pehle bhare thay woh **jaise ke waise**
  hain — edit karne se paise ka record nahi badalta

### Do cheezein jaan-bujhkar galat karke dekho

- **Doosre customer ka account number lene ki koshish:** Edit mein account number
  badal kar kisi doosre customer ka number (jaise `3001`) daal do → Save →
  ✅ red message *"A customer with account number 3001 already exists"*, kuch
  save nahi hoga.
- **Tenure kam karne ki koshish:** aapne 2 hapte bhare hain. Tenure `1` kar ke
  Save karo → ✅ system rok dega: *"Tenure cannot be less than the 2 installments
  already recorded"*. Yeh isliye taaki "Paid 2 of 1" jaisa ulta record na bane.

> **Kaun edit kar sakta hai:** Admin aur Employee dono (kai baar staff ko field
> se hi sudhaar karna padta hai). Har badlav system ke andar record ho jata hai
> ki kisne kab kya badla. **Owner** aur **Sub-ID** edit nahi kar sakte — unke
> page par Edit ka button hi nahi aayega.

---

## Test 20 — 🆕 Customer ka poora record print karo

Yeh **Invoice print** se alag hai. Invoice = ek hapte ki pavti. **Print** =
customer ka poora khata, ek A4 kaagaz par.

1. Customer ke page par upar **Print** button dabao
2. ✅ Ek saaf-suthra page khulega jismein:
   - Upar branch ka naam aur aaj ki tareekh
   - 4 box: **Installments paid**, **Pending**, **Months behind**, **Next due**
   - Customer, Loan, Vehicle aur Guarantor ki saari details
   - **Installment ledger** — abhi tak ke saare hapte, ek-ek row mein
     (date, mahina, hapta, penalty, total, cash/online, invoice number, receipt
     number) aur sabse neeche **Total collected**
   - Neeche do signature lines
3. **Print statement** (ya `Ctrl + P`) dabao → ✅ preview mein app ka header,
   menu aur buttons nahi aane chahiye — sirf khata.

> Yeh page customer ko dikhane ke liye, bank ko dene ke liye, ya file mein
> lagane ke liye kaam aata hai.

---

## Test 20a — 🆕 Foreclosure (loan jaldi band karna)

### Page kholo

1. Upar menu mein **Foreclosure** naam ka link hai — dabao
   > Phone par ☰ (teen line) wale button se milega. Dashboard par bhi ek tile hai.
2. **Loan / account number** ke box mein `3473` daalo → **Search** → naam par click

✅ **Loan details** ka box khulega: loan amount, EMI, tenure, **loan start date**,
first EMI date, gaadi/RC — aur daayein taraf instalments paid, months behind,
EMI overdue, penalty balance, **Total outstanding**.

> **Note:** yahan "loan number" ka matlab wahi **account number** hai jo aap book
> mein likhte ho. System mein alag se koi loan number nahi hai — agar aap chahte
> ho ki alag number ho toh bataiyega.

### 🆕 6 mahine ka niyam

Ramesh ka loan 5 mahine purana hai (Test 7 mein aisa hi banaya tha).

✅ **Peela banner:** *"Foreclosure opens six months after the loan start date.
This loan is 5 months old — eligible from (tareekh)"*
✅ **Add Foreclosure** ka button **dhundhla aur band** — dabta hi nahi.

**Poora test karne ke liye ek naya customer banao** (Test 7 jaisa) —
account `3475`, naam `Vijay More`, **purchase date 8 mahine pehle**.

✅ Ab `3475` par **Add Foreclosure** ka button **chaalu** ho jayega, aur upar
poora hisaab dikhega:

| Cheez | Matlab |
|---|---|
| Remaining months | Kitne hapte baaki |
| EMI outstanding | Kul kitna paisa baaki |
| Interest still scheduled | Aage ka byaj |
| Penalty balance | Penalty baaki |
| **Customer saves** | Customer ka fayda |
| **Final payable** | **Customer ko kitna dena hai** |

Do box aap badal sakte ho: **Interest waived** aur **Bank charge** (₹1,000 apne
aap bhara hai).

3. **Add Foreclosure** dabao → ✅ neeche list mein row (Unpaid)
4. Customer paisa de de toh **Mark paid** dabao (NOC ka tick bhi laga sakte ho)
   → ✅ loan **band** ho jayega, status `Foreclosed`

### 📌 Ek baat poochhni hai

Foreclosure ka hisaab humne aise lagaya hai:

> **Jo paisa baaki hai − jitna byaj maaf kiya + ₹1,000 bank charge + penalty**

👉 **Bataiye yeh sahi hai?** Aur ₹1,000 bank charge har baar ek hi rehta hai ya
badalta hai?

### ⚠️ Employee se check karo

Employee login se `3475` kholo → ✅ **Add Foreclosure** ka button **band** hoga,
aur neeche likha hoga *"Only a branch admin can record a foreclosure."*

---

## Test 20b — 🆕 Seizing (gaadi uthana) aur Exit Seizing

Usi **Foreclosure** page par neeche **Seizing** ka box hai.

### Add Seizing

**Admin se:**
1. `3473` (Ramesh) kholo → **Seizing** box
2. **Seizing charges** `1000`, **Notes** `Gaadi uthai gayi`
3. **Approve now** ka tick laga rehne do → **Add Seizing**

✅ Laal pill **"Seized"** dikhega, tareekh aur rakam ke saath.
✅ Sabse neeche **"Currently seized"** ki list mein woh customer aa jayega.

**Employee se** (kisi doosre customer par):
✅ Entry **"Pending approval"** (peeli) rehti hai — *"Your entry is saved as
pending until a branch admin approves the amount."*
✅ Admin se **Approve seizing** dabao (rakam badal bhi sakte ho) → ✅ **"Seized"**

### 🆕 Exit Seizing — paisa baaki ho toh system rok deta hai

Ramesh ka abhi bahut paisa baaki hai.

✅ **Exit Seizing** ka button **band** hoga, aur neeche likha hoga:
> *"₹XX,XXX is still outstanding (dues + penalty). The customer can only leave
> seizing once that, and any recorded foreclosure amount, is cleared."*

### Ab saara paisa bhar kar dekho

1. Ramesh ke customer page par jaake **saara baaki paisa** bhar do
   (Amount received mein poora **Total outstanding** daal do)
2. Wapas **Foreclosure** page par `3473` kholo

✅ Ab **Exit Seizing** chaalu ho jayega.
3. **Reason** mein `Saara paisa bhar diya` likho → **Exit Seizing** dabao

✅ Green banner **"Customer removed from seizing"**
✅ "Currently seized" list se woh customer **hat jayega**
✅ Neeche chhote akshar mein *"Released (tareekh) — Saara paisa bhar diya"*

### ⚠️ Employee se check karo

Employee login se kisi seize kiye hue customer par jao →
✅ **Exit Seizing** ka button **band**, aur likha hoga
*"Only a branch admin can remove a customer from seizing."*

---

## Test 21 — Sign out karo

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
| **🆕 Kam paisa daalne par split apne aap sahi aaya?** | Haan / Nahi |
| **🆕 Balance aur "kaunsa hapta baaki" sahi dikha?** | Haan / Nahi |
| **🆕 Sirf penalty bharne ka option theek chala?** | Haan / Nahi |
| **🆕 Kya EMI ki pavti print theek nikli, poore hisaab ke saath?** | Haan / Nahi |
| **🆕 Kya ek A4 par 2 copy (Office + Customer) sahi lagi?** | (notes) |
| **🆕 Receipt No. ka format (INV-000001) theek hai?** | Haan / Nahi |
| **🆕 Remark ka option kaam ka hai?** | Haan / Nahi |
| **🆕 System khud ₹500 penalty lagaye — theek hai?** | Haan / Nahi |
| **🆕 Penalty badalna sirf Admin — theek hai?** | (notes) |
| **🆕 Kya First EMI date apne aap sahi aa rahi hai?** | Haan / Nahi |
| **🆕 Kya bank ke naam (Dhanshree / Bhagyalaxmi) sahi hain?** | Haan / Nahi |
| **🆕 Kya Edit ka option theek chala?** | Haan / Nahi |
| **🆕 Kya har page par Back button mil raha hai?** | Haan / Nahi |
| **🆕 Foreclosure page par loan number se detail mili?** | Haan / Nahi |
| **🆕 6 mahine wala niyam sahi chala?** | Haan / Nahi |
| **🆕 Foreclosure ka hisaab sahi hai?** | (notes) |
| **🆕 Add Seizing / Approve / Exit Seizing theek chala?** | Haan / Nahi |
| Kya saare tests pass hue? | Haan / Nahi |
| Kuch aisa jo guide ke hisaab se kaam nahi kiya? | (notes) |
| Kuch screen confusing ya samajh na aane wali lagi? | (notes) |
| Phone par screens theek fit hui aur chali? | Haan / Nahi |

### ⬅️ Chaar sawaal jinke jawab humein chahiye

**1. Penalty pehle ya EMI pehle?**
Customer ₹5,000 deta hai, uspe ₹500 penalty bhi baaki hai. Do tarike:
- **Abhi jaisa hai:** ₹500 penalty + ₹4,500 EMI → hapta ₹500 se **kam** reh jayega
- **Doosra tarika:** ₹5,000 poora EMI → **hapta poora**, penalty ₹500 baaki rahegi

Dono mein ₹500 hi baaki rehta hai — bas **kis column mein** dikhega, woh farak hai.

**2. Purani penalty lagani hai ya aaj se?**
Aapke ~5,000 purane customers hain. Agar kisi ka hapta 2 saal se late hai toh
system ab **poore 2 saal ki penalty** laga dega (₹500 × 24 = ₹12,000).
Poora hisaab lagayein, ya aaj se hi shuru karein?

**3. Penalty badalne aur Seizing hataane ka haq Owner ko bhi?**
Aapne kaha tha "Owner aur Admin". Filhal **sirf Admin** ko diya hai, kyunki system
mein **Owner sirf dekhne ke liye** banaya gaya hai (suraksha ke liye). Employee ko
toh rok diya gaya hai, jo aapki main baat thi.

**4. Foreclosure ka hisaab** (Test 20a dekhiye)

---

## Aage kya aa raha hai

- **Pending customer list** — 0 / 1 / 3 / 5 / Below 3 / Above 5 overdue hapton ke
  hisaab se filter
- **Bank Recovery lists** — har partner bank ke liye ek, rang ke hisaab se
- **Daily Summary** — din ke end ka cash + online collection, totals, pending
- **Documents & Keys** — physical handover status track karna
- **OTP** — penalty badalne, foreclosure aur seizing par mobile OTP ki suraksha
- **Penalty har raat apne aap** — abhi penalty tab lagti hai jab aap customer ka
  page kholte ho ya paisa bharte ho. Aage woh har raat khud lag jayegi.

Har naye piece ke liye aapko ek updated test guide milegi.

---

*Agar testing ke dauraan kuch galat ho — page load na ho, button kuch na kare,
koi error message aaye — please uska screenshot lekar humein bhej dijiye. Chhoti
si problem bhi humare liye useful hoti hai.*
