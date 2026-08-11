# Naye Changes — Testing Guide (Hinglish)

Namaste! Aapne jo **15 recordings** bheji thi, unme se **9 ka kaam ho gaya hai** —
yeh sab **paisa aur pavti** se juda hua hai.

Baaki **6** (Foreclosure aur Seizing ka naya page) **abhi ban raha hai** — woh
agle round mein aayega. Neeche "Abhi jo baaki hai" mein poori list hai.

Yeh guide **sirf naye kaam ki** hai — poora system dobara test karne ki zarurat
nahi.

> Poori guide `docs/CLIENT_TESTING_HINGLISH.md` mein hai — agar naya banda system
> seekh raha ho toh woh padhaiye.

---

## Shuru karne se pehle

| | |
|---|---|
| **Website** | https://vehical-info.vercel.app/ |
| **Aapka login (Owner)** | `client@vehiclefinance.in` / `Client@2026` |

⚠️ **Important:** Owner khud entry nahi kar sakta — woh sirf dekhne ke liye hai.
**Neeche ke saare tests apne branch ke Admin login se kariye** (jaise
`pune.admin@test.com` / `Welcome123!`).

Is baar **Admin login zaroori hai** — Test 6 aur 7 mein penalty badalne ka option
sirf Admin ko milta hai. Employee se bhi ek baar login kar ke dekhiyega ki usko
woh option **nahi** dikhta.

**Print wale test (Test 4 aur 8) computer par kariye** — preview wahin theek dikhta hai.

---

## 🧾 Ek nazar mein — kya-kya hua

| Aapki recording | Kya kaha tha | Test |
|---|---|---|
| 11, 14 | Kam paisa diya toh baaki balance dikhna chahiye | **Test 2, 3** |
| 13 | Sirf penalty bharne ka alag option | **Test 5** |
| 10 | Penalty sirf Owner/Admin badal sakein | **Test 6, 7** |
| 2 | Instalment register mein **Remark** ka option | **Test 2** |
| 3 | Pavti ka number apne aap bane | **Test 4** |
| 1 | Print par **First EMI date** | **Test 4** |
| 12 | Print par **total baaki** aur **aaj kitna liya** | **Test 4** |
| 15 | Print par poora hisaab (EMI, balance, penalty, kaunsa mahina baaki) | **Test 4** |

---

## Test 1 — Ek naya customer banaiye (baaki test isi par honge)

1. Admin se login → **Customers** → **Add customer**
2. **Purchase / loan date** mein **4 mahine pehle** ki tareekh daaliye
   > Aaj August 2026 hai toh `12-04-2026`. Purani date isliye taaki penalty aur
   > balance turant dikh jaye — mahino ka intezaar na karna pade.
3. Baaki boxes:

| Box | Value |
|---|---|
| Account number | `5001` |
| Name | `Suresh` |
| Father / middle name | `Ganpat` |
| Surname | `Jadhav` |
| Village | `Wagholi` |
| Mobile number 1 | `9876500001` |
| Model no. | `Hero Splendor` |
| Bank | `Dhanshree Bank` |
| Loan amount | `60000` |
| Installment / EMI | `5000` |
| Tenure (months) | `12` |

**Save customer** dabaiye → **EMI / Payments** tab kholiye.

---

## Test 2 — 🆕 Kam paisa aaya toh? (Partial payment)

**Aapne kaha tha (recording 11):** *"कस्टमरने सिस्टीमने काढलेल्या ईएमआय पेक्षा कमी
रक्कम दिली तर पेड अमाउंट चा ऑप्शन असावा."*

Suresh 4 mahine se ek bhi hapta nahi bhara, isliye upar aisa dikhega:

| Box | Kya dikhega |
|---|---|
| Balance on EMI #1 | **₹5,000** |
| EMI overdue | **₹20,000** |
| Penalty balance | **₹1,500** |
| **Total outstanding** | **₹61,500** |

> Penalty ₹1,500 kyun? Kyunki **3 hapte** apni tareekh (+2 din) nikal chuke hain,
> ₹500 × 3 = ₹1,500. Chautha hapta abhi-abhi due hua hai, uspe abhi penalty nahi.

### Ab kam paisa daal kar dekhiye

1. **Amount received (₹)** ke box mein `3000` likhiye
2. ✅ Neeche **apne aap** yeh bhar jayega:
   - **Towards penalty ₹1,500**
   - **Towards instalment ₹1,500**
3. ✅ Aur uske neeche **abhi ka hisaab** dikhega:

| | |
|---|---|
| Instalments settled | **0 of 12** |
| Balance on EMI #1 | **₹3,500** |
| Penalty balance | **₹0** |
| **Total outstanding** | **₹58,500** |

**Yeh sabse zaroori baat hai:** ₹1,500 dene se hapta **poora nahi hua**, isliye
"0 of 12" hi rahega aur ₹3,500 **balance** ban gaya.

### Remark bhi bhariye (recording 2)

**Remark** ke box mein likhiye: `Aadha paisa, baaki agle hafte`

**Record instalment** dabaiye.

✅ Green banner **"Instalment recorded"** + bagal mein **Print receipt** ka button.
✅ Neeche grid mein nayi row, aur usme **Remark** ka column bhi hai.

---

## Test 3 — 🆕 Baaki paisa aane par hapta poora hota hai

**Aapne kaha tha (recording 14):** *"उरलेली रक्कम बॅलन्स म्हणून ठेवायची."*

1. Ab **Amount received** mein `3500` daaliye
   > Yahi woh baaki paisa hai jo Test 2 mein bacha tha.
2. ✅ Penalty ₹0 hai, isliye poora ₹3,500 **instalment** mein jayega
3. **Record instalment** dabaiye

✅ **Ab dekhiye:**

| | |
|---|---|
| Instalments settled | **1 of 12** ← ab poora hua! |
| Balance on EMI #2 | **₹5,000** |

**Do entry hui, lekin hapta ek hi gina gaya.** Pehle system har entry ko ek pura
hapta maanta tha — ab woh **paise se ginta hai**, isliye hisaab sahi rehta hai.

---

## Test 4 — 🧾 Pavti print kijiye ⭐ (sabse important)

**Aapne kaha tha (recordings 1, 3, 12, 15).**

Grid mein sabse **pehli** row ke aakhir mein **Receipt no.** wale button
(`INV-000001` jaisa) par click kijiye.

### ✅ Pavti par yeh sab check kijiye

| # | Cheez | Kya dikhna chahiye |
|---|---|---|
| 1 | Sabse upar | Branch ka naam, address, phone |
| 2 | **🆕 Pavti number** | **Receipt No. INV-000001** — system ne khud banaya |
| 3 | Aapka number | **Book no.** (jo aapne haath se bhara, khaali chhoda toh nahi dikhega) |
| 4 | Customer | `A/c 5001`, `Suresh Ganpat Jadhav` |
| 5 | **🆕 First EMI date** | Customer ke naam ke neeche — `Date … · EMI ₹5,000 · First EMI …` |
| 6 | **🆕 Aaj ka EMI** | `Instalment no. 1` → **₹1,500** |
| 7 | **🆕 EMI ka balance** | `Balance on EMI #1` → **₹3,500** |
| 8 | **🆕 Aaj ki penalty** | `Penalty paid` → **₹1,500** |
| 9 | **🆕 Penalty balance** | **₹0** |
| 10 | **🆕 Aaj kul kitna liya** | `Total paid today` → **₹3,000** |
| 11 | **🆕 Kul kitna baaki** | `Total outstanding` → **₹58,500** |
| 12 | Kitne hapte baaki | `Paid 0 of 12` · **PENDING 12** |
| 13 | 🆕 Remark | Sabse neeche — `Aadha paisa, baaki agle hafte` |
| 14 | Sabse neeche | **Received by** aur **Customer signature** |

### Ab actual print nikaliye

**Print receipt** (ya `Ctrl + P`) dabaiye.

✅ **Ek hi A4 kaagaz par DO pavti** — upar Office copy, neeche Customer copy,
beech mein katne ki line. App ka neela header/menu print mein **nahi** aana chahiye.

### ⭐ Purani pavti dobara print kar ke dekhiye

Yeh sabse zaroori check hai. Doosri row ki pavti kholiye, phir wapas **pehli**
wali kholiye.

✅ Pehli pavti par abhi bhi **wahi purane number** hone chahiye —
`Balance on EMI #1 = ₹3,500`, `Total paid today = ₹3,000`.

**Aisa jaan-bujh kar hai:** pavti us din ka record hai. Jo kaagaz customer ko us
din diya tha, dobara nikalne par bilkul wahi nikalna chahiye — warna hisaab mein
gadbad ho jayegi.

---

## Test 5 — 🆕 Sirf penalty bharne ka alag option

**Aapne kaha tha (recording 13):** *"कस्टमरला फक्त पेनल्टी भरायची असेल तर वेगळा
पे पेनल्टी ऑप्शन असावा."*

Abhi Suresh ki penalty balance ₹0 hai, toh pehle thodi penalty banane dijiye —
ya **kisi aur purane customer** par yeh test kar lijiye jiski penalty baaki ho.

Jis customer ki **penalty balance ₹0 se zyada** hai, uske page par
**EMI / Payments** tab mein ek alag panel dikhega:

> ### Pay penalty only
> Outstanding penalty **₹1,500**

1. **Amount received** mein `500` daaliye (poori penalty nahi, aadhi)
2. ✅ Poora ₹500 **Towards penalty** mein jayega, **instalment ₹0**
3. **Record penalty payment** dabaiye

✅ **Kya hona chahiye:**
- Banner: **"Penalty payment recorded"**
- Penalty balance ab **₹1,000**
- Instalment ki ginti **bilkul nahi badli**
- Us pavti par upar likha aayega **"Penalty Receipt"** (EMI Receipt nahi)

---

## Test 6 — 🆕 Penalty ka poora hisaab dikhta hai

**EMI / Payments** tab mein neeche **Penalty ledger** naam ka panel hai.

✅ Usme har mahine ka alag row hoga:

| Month | Period | Source | Charged |
|---|---|---|---|
| 1 | (tareekh) | Automatic | ₹500 |
| 2 | (tareekh) | Automatic | ₹500 |
| 3 | (tareekh) | Automatic | ₹500 |

Neeche likha hoga:
> *"A penalty of ₹500 is charged automatically for every instalment still short
> 2 days after it falls due."*

**Matlab:** ab system khud ₹500 lagata hai — aapko haath se likhna nahi padta.

---

## Test 7 — 🆕 Penalty badalna sirf Admin ke haath mein

**Aapne kaha tha (recording 10):** *"पेनल्टी कमी-जास्त करण्याचा अधिकार फक्त मालक
आणि ऍडमिनला असावा."*

### Admin se (abhi aap Admin ho)

Penalty ledger ke har row ke aage **ek box aur do button** dikhenge:

1. Pehle row ka box `500` se badal kar `300` kar dijiye → **Save** dabaiye
   ✅ Banner "Penalty updated", aur **Penalty balance ₹200 kam** ho jayega
2. Usi row par **Waive** dabaiye
   ✅ Row par line lag jayegi (kaat di gayi), aur balance aur ₹300 kam ho jayega
   ✅ **Restore** dabakar wapas la sakte ho

### ⚠️ Ab Employee se login kar ke dekhiye

Employee login se wahi customer kholiye → **Penalty ledger** panel.

✅ **Employee ko box aur button dikhne hi nahi chahiye** — sirf list dikhegi, aur
neeche likha hoga:
> *"Only a branch admin can change or waive a charge."*

### 📌 Ek baat aapse poochhni hai

Aapne kaha tha **"Owner aur Admin"**. Filhal humne **sirf Admin** ko yeh haq diya
hai, kyunki system mein **Owner sirf dekhne ke liye** banaya gaya hai (woh kisi
bhi branch mein entry nahi kar sakta — yeh suraksha ke liye hai).

**Employee ko toh rok diya gaya hai, jo aapki main baat thi.**

👉 **Bataiye:** Admin-only theek hai, ya Owner ko bhi badalne ka haq chahiye?

---

## Test 8 — Poore khate ki print

Customer ke page par upar **Print** button dabaiye.

✅ Ab upar **8 box** dikhenge (pehle 4 thay) — naye 4:
**Balance on EMI #**, **EMI overdue**, **Penalty balance**, **Total outstanding**.

✅ Neeche **Instalment ledger** mein ab **Remark** ka column bhi hai, aur
**Receipt no.** / **Book no.** alag-alag columns hain.

---

## Test 9 — Rang wale counts (🟢🟡🟠🔴) abhi bhi sahi hain?

Yeh purana feature hai, lekin ab ginti **paise se** hoti hai — isliye ek baar
check kar lijiye.

**Naya niyam:** agar kisi ne hapta **aadha** bhara hai, toh woh hapta **poora
nahi** gina jayega — matlab woh customer **peeche** hi maana jayega.

Pehle yeh **galat** tha: aadha paisa bhi poora hapta gin liya jata tha.

✅ Header ke rang wale counts par click kar ke list dekh lijiye — jo customer
poore hapte bharte aaye hain, unka rang **bilkul nahi badla** hoga.

---

## 📋 Wapas humein kya batana hai

| # | Cheez | Theek hai? | Notes |
|---|---|---|---|
| 1 | Kam paisa daalne par **split apne aap** sahi aaya? | Haan / Nahi | |
| 2 | **Penalty pehle** kategi, phir EMI — yeh theek hai? ya EMI pehle katni chahiye? | | ⬅️ zaroor bataiye |
| 3 | **Balance** aur **kaunsa hapta baaki** sahi dikha? | Haan / Nahi | |
| 4 | **Sirf penalty** bharne ka option theek chala? | Haan / Nahi | |
| 5 | Pavti par **poora hisaab** aa gaya? Kuch chhoot gaya? | | |
| 6 | **Receipt No.** ka format (`INV-000001`) theek hai? | Haan / Nahi | |
| 7 | **Remark** ka option kaam ka hai? | Haan / Nahi | |
| 8 | System khud **₹500 penalty** lagaye — theek hai? | Haan / Nahi | |
| 9 | **Purani penalty** — jo pichle mahino ki hai, woh bhi lagni chahiye ya aaj se? | | ⬅️ zaroor bataiye |
| 10 | Penalty badalna **sirf Admin** — theek hai ya Owner ko bhi chahiye? | | ⬅️ zaroor bataiye |
| 11 | Employee ko penalty ka option **nahi** dikha — sahi? | Haan / Nahi | |
| 12 | Phone par sab theek dikha? | Haan / Nahi | |

### ⬅️ Teen sawaal jinke jawab humein chahiye

**1. Penalty pehle ya EMI pehle?**
Customer ₹5,000 deta hai, uspe ₹500 penalty bhi baaki hai. Do tarike hain:
- **Abhi jaisa hai:** ₹500 penalty + ₹4,500 EMI → hapta ₹500 se **kam** reh jayega
- **Doosra tarika:** ₹5,000 poora EMI → **hapta poora**, penalty ₹500 baaki rahegi

Dono mein customer par ₹500 hi baaki rehta hai — bas **kis column mein** dikhega,
woh farak hai. Aap kaunsa chahte ho?

**2. Purani penalty lagani hai ya aaj se?**
Aapke ~5,000 purane customers hain. Agar kisi ka hapta 2 saal se late chal raha
hai, toh system ab **poore 2 saal ki penalty** laga dega (₹500 × 24 = ₹12,000).
- **Poora hisaab lagao** (abhi aisa hi hai), ya
- **Aaj se hi lagao** (purani maaf)

**3. Penalty badalne ka haq Owner ko bhi?** (Test 7 dekhiye)

---

## Abhi jo baaki hai (agle round mein)

Aapki **recordings 4 se 9 tak** — **Foreclosure aur Seizing ka naya page**:

- Alag page jisme **loan number** daal kar customer ki poori detail dikhe
- **Add Foreclosure** ka button — sirf un customers ke liye jinke **6 mahine
  poore** ho gaye hain (jinke nahi hue, unka button band rahega)
- **Add Seizing** ka button, aur seize kiye hue customers ki list
- **Exit Seizing** — jab customer saara paisa, penalty aur foreclosure ki poori
  rakam bhar de, tab usse seizing se hataana (sirf Admin)

Yeh isliye baad mein rakha kyunki **"saara paisa bhar diya"** check karne ke liye
pehle upar wala paisa ka hisaab sahi hona zaroori tha — woh ab ho gaya hai.

Uske baad: **Bank Recovery lists**, **Daily Summary**, **Pending list**
(0/1/3/5 ke hisaab se), **Documents & Keys**.

---

*Testing ke dauraan kuch galat lage — page load na ho, button kuch na kare, koi
error aaye, ya print theek na nikle — toh uska **screenshot** lekar bhej dijiye.
Chhoti si baat bhi humare liye kaam ki hai.*
