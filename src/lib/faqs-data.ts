// Full FAQ knowledge base — 115 questions categorized for SEO discoverability.
// Used by the homepage teaser, /faqs detail page and footer popular-FAQ list.

export type FaqCategoryKey =
  | "registration"
  | "documents"
  | "download-print"
  | "updates-validity"
  | "udyog-aadhaar"
  | "fees-benefits"
  | "troubleshooting";

export type FaqCategory = {
  key: FaqCategoryKey;
  title: string;
  description: string;
  icon: string; // lucide icon name
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: "registration",
    title: "Registration & Eligibility",
    description:
      "Who can register for Udyam/MSME, how the registration works, and which businesses qualify.",
    icon: "UserPlus",
  },
  {
    key: "documents",
    title: "Documents & Process",
    description:
      "Documents required for Udyam, the step-by-step registration process, NIC codes and PAN/Aadhaar.",
    icon: "FileText",
  },
  {
    key: "download-print",
    title: "Certificate Download & Print",
    description:
      "Download, reprint and print your Udyam/MSME certificate — including PDF, annexure, and bank submissions.",
    icon: "Download",
  },
  {
    key: "updates-validity",
    title: "Updates, Edits & Validity",
    description:
      "Update business details, edit Udyam information, validity, renewal and cancellation rules.",
    icon: "RefreshCcw",
  },
  {
    key: "udyog-aadhaar",
    title: "Udyog Aadhaar & Migration",
    description:
      "Differences between Udyog Aadhaar and Udyam, how to migrate, and accessing old UAN certificates.",
    icon: "ArrowRightLeft",
  },
  {
    key: "fees-benefits",
    title: "Fees, Benefits & Uses",
    description:
      "Is registration free? What benefits do MSMEs get — loans, subsidies, tenders and tax rebates.",
    icon: "BadgeIndianRupee",
  },
  {
    key: "troubleshooting",
    title: "Troubleshooting & Support",
    description:
      "Fix common errors, recover lost Udyam numbers, OTP problems, and where to get official help.",
    icon: "LifeBuoy",
  },
];

export type Faq = {
  id: number;
  q: string;
  a: string;
  category: FaqCategoryKey;
  popular?: boolean;
};

export const FAQS: Faq[] = [
  { id: 1, category: "registration", popular: true, q: "What is Udyam registration and who needs it?", a: "Udyam registration is the official Government of India online system for registering Micro, Small and Medium Enterprises (MSMEs). Any business owner, startup, trader, manufacturer, freelancer or service provider running a small or medium enterprise can register to access government benefits, subsidised loans, priority tenders and MSME subsidies." },
  { id: 2, category: "udyog-aadhaar", q: "Is Udyog Aadhaar still valid or not?", a: "Udyog Aadhaar is technically valid for existing holders, but new registrations are no longer accepted. It is strongly recommended to migrate to Udyam Registration to receive instant certification, updated records and access to all current MSME schemes that Udyog Aadhaar can no longer support." },
  { id: 3, category: "registration", popular: true, q: "How can I register for MSME online?", a: "You can register for MSME online by visiting the official Udyam Registration portal (udyamregistration.gov.in). Using your Aadhaar number and PAN, you fill the registration form, submit your business details, complete OTP verification and receive your Udyam certificate instantly — fully paperless and free." },
  { id: 4, category: "documents", popular: true, q: "What documents are needed for Udyam registration?", a: "For Udyam registration you only need your Aadhaar number, PAN, and basic business details such as business type, address, bank account information and NIC code. No physical documents need to be uploaded — the whole process is online and hassle-free." },
  { id: 5, category: "download-print", q: "Is Udyam certificate free to download?", a: "Yes, the Udyam certificate is completely free and can be downloaded any number of times from the official portal. There are no charges for registration, certificate re-download or updates, making MSME registration accessible for every small business." },
  { id: 6, category: "registration", q: "How long does MSME Udyam registration take?", a: "If all required details are ready, Udyam registration usually takes only 5–10 minutes. Instant Aadhaar OTP verification ensures you receive your Udyam Certificate immediately, with no waiting period or follow-up visits." },
  { id: 7, category: "updates-validity", popular: true, q: "Can I update my Udyam registration certificate online?", a: "Yes, the Udyam portal allows you to edit or update details such as business address, turnover, NIC code or contact information. Keeping your records up to date ensures continued eligibility for government schemes, MSME loans and tender participation." },
  { id: 8, category: "download-print", q: "I lost my MSME certificate, how can I get it again?", a: "You can re-download your Udyam certificate anytime using your Aadhaar number or Udyam Registration Number (URN). The process is free and fully online, so you can retrieve your certificate immediately for loans, bank submissions or tenders." },
  { id: 9, category: "udyog-aadhaar", q: "Is Udyam Aadhaar and Udyog Aadhaar the same thing?", a: "No. Udyog Aadhaar is the older MSME registration system, while Udyam Aadhaar is the updated official system that issues instant certification, supports improved tracking and grants eligibility for current government MSME benefits and schemes." },
  { id: 10, category: "registration", q: "Where can I register MSME officially?", a: "You should register only on the official Government of India portal: udyamregistration.gov.in. Registering on the official site ensures your data is secure, registration is completely free, and your certificate is recognised for every official purpose." },
  { id: 11, category: "udyog-aadhaar", q: "How do I download Udyog Aadhaar certificate?", a: "Existing Udyog Aadhaar holders can download their certificates from the old Udyog Aadhaar portal using their UAN and registered mobile number. However, migrating to Udyam Registration is recommended for updated benefits, modern MSME tracking and access to government schemes." },
  { id: 12, category: "fees-benefits", popular: true, q: "Is Udyam registration free?", a: "Yes, Udyam registration is 100% free for all businesses. There are no hidden charges for application, certificate download, updates or re-prints, making it easy for proprietors, startups and small businesses to register." },
  { id: 13, category: "updates-validity", q: "How can I update my Udyam registration number details?", a: "Log in to the Udyam portal using your URN and Aadhaar-linked mobile number. After OTP verification you can edit details such as business name, address, turnover or bank account easily, without having to reapply." },
  { id: 14, category: "updates-validity", q: "Do I need to renew my Udyam certificate every year?", a: "No, Udyam registration is valid for a lifetime. You only need to update your details when there is a change in business structure, turnover, address or activity, so that you remain eligible for MSME schemes." },
  { id: 15, category: "fees-benefits", q: "What is the use of Udyam certificate?", a: "The Udyam certificate is official proof of your MSME status. It helps you access government subsidies, tax rebates, priority sector lending, GST and trademark concessions, and eligibility to participate in tenders and MSME-only schemes." },
  { id: 16, category: "registration", q: "How to register a startup under MSME Udyam?", a: "Startups, freelancers and new founders can register on the Udyam portal using Aadhaar and PAN. Registration is instant and gives you formal recognition for government schemes, bank loans, MSME-only tenders and easier participation in e-tendering." },
  { id: 17, category: "fees-benefits", q: "Are there any charges for MSME registration?", a: "No, Udyam registration is completely free. You can apply, download and update your certificate without paying any government fee, ensuring smooth access to MSME benefits for every small business." },
  { id: 18, category: "registration", q: "Can I register MSME without a GST number?", a: "Yes — businesses not liable for GST can still register for Udyam. If your business is GST registered, the portal will automatically fetch GST details to make the registration faster and error-free." },
  { id: 19, category: "documents", q: "What is Udyam registration number used for?", a: "The Udyam Registration Number (URN) is your unique MSME identifier. It is required for accessing government subsidies, MSME loans, licences, tender participation and verification under various MSME schemes." },
  { id: 20, category: "download-print", q: "How do I download MSME certificate?", a: "To download your MSME certificate, visit the Udyam portal, enter your Aadhaar or URN, complete OTP verification, and download the certificate as a PDF. This digital certificate is valid for every official purpose." },
  { id: 21, category: "registration", q: "Is MSME registration compulsory for all businesses?", a: "No, MSME registration is not legally mandatory, but it is highly beneficial. Registered MSMEs get government subsidies, low-interest loans, MSME-only tenders and a wide range of growth schemes that unregistered businesses cannot access." },
  { id: 22, category: "download-print", q: "What is Udyam card and how to get it?", a: "The Udyam card is simply the downloadable Udyam certificate. After registration on the portal the certificate is issued instantly in PDF format, which can be printed or used digitally for business, banking and tender purposes." },
  { id: 23, category: "updates-validity", q: "Can I edit Udyam registration if I made a mistake?", a: "Yes, the Udyam portal allows corrections anytime. You can edit your business name, address, NIC codes or turnover to keep your official records accurate, without re-applying for a new registration." },
  { id: 24, category: "udyog-aadhaar", q: "My friend told me about Udyog Aadhaar card. Is that still used?", a: "Udyog Aadhaar is now phased out for new registrations. Existing holders are encouraged to migrate to Udyam Registration so they continue to enjoy accurate records, updated benefits and smooth participation in current MSME schemes." },
  { id: 25, category: "troubleshooting", q: "How to check if my MSME is already registered?", a: "You can check your MSME status by entering your Aadhaar or URN on the Udyam portal. The portal will display your registration details instantly, confirming your MSME certification status." },
  { id: 26, category: "registration", q: "Can I register for Udyam on mobile?", a: "Yes, the Udyam portal is fully mobile friendly. You can complete registration, download certificates and update details from any smartphone, which is especially convenient for business owners on the go." },
  { id: 27, category: "registration", q: "Does Udyam registration link with Aadhaar?", a: "Yes, Aadhaar is the primary verification document for Udyam registration. It ensures secure identity verification and is also used for OTP authentication when downloading, updating or reprinting your certificate." },
  { id: 28, category: "udyog-aadhaar", q: "How can I apply for Udyog Aadhaar free registration?", a: "New Udyog Aadhaar registrations are no longer allowed. All MSME registrations must now be completed through the Udyam portal, which is free and provides instant digital MSME certificates." },
  { id: 29, category: "udyog-aadhaar", q: "Is Udyog Aadhaar number different from Udyam number?", a: "Yes. Udyog Aadhaar Number (UAN) is the old ID, while the Udyam Registration Number (URN) is the current official identifier for MSME registration, loans, subsidies and government schemes." },
  { id: 30, category: "udyog-aadhaar", q: "Can I use old Udyog Aadhaar for MSME loan?", a: "Some banks still accept Udyog Aadhaar, but most lenders now prefer Udyam certification. Migrating ensures smoother approval for MSME loans, tenders and participation in current government programmes." },
  { id: 31, category: "documents", q: "What is udyamregistration.gov.in used for?", a: "udyamregistration.gov.in is the official Government of India portal for MSME registration. It lets businesses apply for Udyam, download certificates, edit details and verify URN numbers securely." },
  { id: 32, category: "troubleshooting", q: "My Udyam download is not working, what to do?", a: "If downloading fails, clear your browser cache or try a different browser. Make sure your Aadhaar-linked mobile is reachable so that OTP verification can complete — only then will the certificate download succeed." },
  { id: 33, category: "troubleshooting", q: "Is there a helpline for Udyam certificate issues?", a: "Yes, the Udyam portal provides support via the email and helpline numbers listed on its homepage. You can reach out for assistance with registration, certificate download or verification issues." },
  { id: 34, category: "registration", q: "What is Aadhaar Udyam registration?", a: "Aadhaar Udyam registration refers to registering your MSME using your Aadhaar card. It is a paperless, secure and instant registration process that issues a unique Udyam Number for accessing government schemes and benefits." },
  { id: 35, category: "download-print", q: "How many times can I download MSME Udyam certificate?", a: "You can download your Udyam certificate unlimited times. There are no charges or restrictions, ensuring you can access it whenever required for banks, tenders or government submissions." },
  { id: 36, category: "fees-benefits", popular: true, q: "What are the benefits of Udyam registration certificate?", a: "Udyam registration offers multiple benefits including lower interest rates on loans, government subsidies, tax rebates, easier statutory compliance, collateral-free credit guarantees and eligibility for priority tender participation." },
  { id: 37, category: "fees-benefits", q: "What if I don’t register my MSME under Udyam?", a: "Without Udyam registration, businesses miss out on government schemes, financial incentives, collateral-free MSME loans and priority in tendering. Registration provides official MSME recognition and continued institutional support." },
  { id: 38, category: "troubleshooting", q: "Does Udyam registration require bank account info?", a: "Yes, bank account details are mandatory during registration. Accurate account information ensures smooth disbursal of loans, subsidies and other MSME-related financial benefits straight to your business." },
  { id: 39, category: "documents", q: "How to check my Udyam status after registration?", a: "Log in to the Udyam portal using your Aadhaar and OTP. Your registration status, certificate and full business details will be displayed instantly, confirming successful Udyam registration." },
  { id: 40, category: "troubleshooting", q: "Is Udyam Aadhaar registration different from Udyam registration certificate?", a: "No, they refer to the same process. Udyam Aadhaar registration results in the issuance of the Udyam Registration Certificate, which is valid proof of your MSME status." },
  { id: 41, category: "download-print", q: "Do I need to carry Udyam certificate physically?", a: "A physical copy is not mandatory. You can keep a digital copy on your device or print it when needed for loans, tenders or government schemes — both digital and printed formats are equally valid." },
  { id: 42, category: "updates-validity", q: "Can I register again if I made a mistake in the first attempt?", a: "No, re-registration is not required. Use the portal’s edit feature to correct any mistakes in your existing Udyam registration so that you maintain a single, valid MSME record." },
  { id: 43, category: "updates-validity", q: "Is there a fee for updating Udyam certificate?", a: "No, all updates to your Udyam registration are free. You can edit business information, turnover or address at any time without any charges via the official portal." },
  { id: 44, category: "udyog-aadhaar", q: "I have Udyog Aadhaar, do I need to re-register?", a: "Yes, it is recommended to migrate to Udyam Registration. Migration ensures updated records, access to current MSME schemes and smoother verification for loans, subsidies and government tender participation." },
  { id: 45, category: "udyog-aadhaar", q: "Where can I download Udyog Aadhaar certificate now?", a: "Existing certificates can still be downloaded from the old Udyog Aadhaar portal archive. However, migrating to Udyam is strongly advised for updated benefits and modern MSME tracking." },
  { id: 46, category: "troubleshooting", q: "Can I register my side-business on Udyam too?", a: "Yes, even small side-businesses, home-based ventures or freelancers can register under Udyam. This helps you access MSME loans, subsidies and official recognition under government schemes." },
  { id: 47, category: "udyog-aadhaar", q: "How can I check Udyog Aadhaar number validity?", a: "Check your Udyog Aadhaar number on the old portal. For accuracy and updated benefits, it is recommended to migrate to Udyam and use the URN for all future verification needs." },
  { id: 48, category: "updates-validity", q: "Can I change my Udyam number?", a: "No, your Udyam Number is permanent. However, you can freely update all other business details — address, turnover, NIC codes, bank account — without affecting your registration number." },
  { id: 49, category: "download-print", q: "Do I get a physical Udyam card by post?", a: "No, Udyam registration is completely digital. The certificate is issued as a PDF which you can download, save or print for official purposes such as tender submissions and bank loans." },
  { id: 50, category: "fees-benefits", q: "Will Udyam help in government eTendering?", a: "Yes, Udyam certification is often mandatory for MSMEs to participate in government eTendering. It verifies your MSME status and grants eligibility for preferential treatment in MSME-only tenders." },
  { id: 51, category: "download-print", q: "How does MSME certificate download process work?", a: "Enter your URN or Aadhaar on the Udyam portal, complete OTP verification, and download your certificate in PDF format. The process is instant, paperless and secure for every business owner." },
  { id: 52, category: "updates-validity", q: "Can I cancel my Udyam registration?", a: "The portal does not allow complete cancellation. However, if operations cease you can update your business status to “inactive” so that your records remain accurate." },
  { id: 53, category: "registration", q: "Is MSME registration same for all states?", a: "Yes, Udyam registration is a central Government of India initiative and is valid across all states and union territories. There are no state-specific variations in the registration process or benefits." },
  { id: 54, category: "troubleshooting", q: "What is the benefit of Udyog Aadhaar update?", a: "Updating Udyog Aadhaar ensures all business information is current, which helps in faster verification for MSME loans, subsidies, tenders and government schemes." },
  { id: 55, category: "updates-validity", q: "My Udyam certificate has an error, what to do?", a: "Log in to the portal using your Aadhaar and use the edit option to correct any errors. This ensures your official records match your current business details without re-applying." },
  { id: 56, category: "download-print", q: "Can I reprint my Udyam registration certificate?", a: "Yes, you can reprint your certificate unlimited times. Simply log in using your URN or Aadhaar, complete OTP verification, and download the PDF for printing." },
  { id: 57, category: "registration", q: "Are traders eligible for Udyam certificate registration?", a: "Yes, traders are now eligible under Udyam registration. They can avail MSME benefits including loans, subsidies and priority access to government schemes and tenders." },
  { id: 58, category: "registration", q: "Can I do Udyam registration without PAN card?", a: "No, PAN is mandatory for Udyam registration. It helps verify business ownership, ensures tax compliance and is used alongside Aadhaar for secure registration." },
  { id: 59, category: "troubleshooting", q: "What happens after Udyam registration is done?", a: "After successful registration, your Udyam Certificate is issued instantly and emailed to you. It can be used for loans, tenders, government schemes and as official proof of MSME status." },
  { id: 60, category: "udyog-aadhaar", q: "Is there an expiry for Udyog Aadhaar certificate?", a: "Udyog Aadhaar is being phased out for new registrations. Users are encouraged to migrate to Udyam for lifetime validity and access to modern MSME benefits." },
  { id: 61, category: "updates-validity", q: "What if I register my MSME multiple times?", a: "Multiple registrations can create conflicts in government databases and may affect your eligibility for loans or subsidies. It is recommended to update your existing Udyam registration rather than applying again." },
  { id: 62, category: "updates-validity", q: "How often should I update my Udyam info?", a: "Update your Udyam registration annually, or whenever there is a significant change in business details such as turnover, address or activity, so MSME benefits are not interrupted." },
  { id: 63, category: "troubleshooting", q: "Can foreign-owned companies get Udyam certificate?", a: "Yes, foreign-owned businesses can register under Udyam if they are legally registered in India and meet MSME criteria. They gain access to government schemes and official MSME recognition." },
  { id: 64, category: "documents", q: "Is GST mandatory for Udyam registration?", a: "GST is not mandatory for every business. Only those liable for GST must provide their GST number — others can register using only Aadhaar and PAN without GST." },
  { id: 65, category: "documents", q: "How many NIC codes can I select in Udyam?", a: "You can select multiple NIC (National Industrial Classification) codes to reflect all your business activities accurately. This ensures correct MSME classification for benefits and scheme eligibility." },
  { id: 66, category: "documents", popular: true, q: "What is the Udyam registration process step-by-step?", a: "Visit udyamregistration.gov.in → enter Aadhaar → verify via OTP → fill business details → submit → download certificate. The whole process is instant, paperless and completely free." },
  { id: 67, category: "registration", q: "Can I register Udyam if I’m unemployed but have a business idea?", a: "Yes, anyone planning to start a business or already operating one can register under Udyam. It helps secure formal MSME recognition and unlocks access to financial and government benefits." },
  { id: 68, category: "fees-benefits", q: "What kind of support do MSMEs get after Udyam registration?", a: "Registered MSMEs enjoy government subsidies, priority lending, tax rebates, easier compliance norms, credit guarantee support and eligibility for MSME-only tender participation." },
  { id: 69, category: "fees-benefits", q: "Can I use Udyam number in my invoice or business card?", a: "Yes, displaying your Udyam Number on invoices, business cards and official documents helps prove MSME status and can improve credibility with banks, suppliers and clients." },
  { id: 70, category: "fees-benefits", q: "Should I keep my Udyam certificate printed or soft copy?", a: "It is advisable to keep both digital and printed copies. The soft copy is useful for quick sharing, while the printed certificate may be required for bank loans or tender submissions." },
  { id: 71, category: "documents", q: "How can I complete the MSME registration process online?", a: "Complete MSME registration via the Udyam portal using Aadhaar, PAN and basic business details. The process is free, instant, paperless and issues a verified MSME certificate immediately." },
  { id: 72, category: "download-print", q: "How do I download my Udyam Card?", a: "Visit the Udyam portal, enter your URN, verify via OTP sent to your Aadhaar-linked mobile, and download the Udyam card in PDF format for official and business use." },
  { id: 73, category: "updates-validity", q: "How can I edit my Udyam Registration details?", a: "Log in to the Udyam portal using your URN or Aadhaar, complete OTP verification, and update business details such as address, turnover and activity. All updates are free and reflected immediately." },
  { id: 74, category: "registration", q: "What is Udyam MSME Registration?", a: "Udyam MSME Registration is the official Government of India system for registering Micro, Small and Medium Enterprises. It issues instant certification and grants access to all current MSME schemes and benefits." },
  { id: 75, category: "registration", q: "Is Udyog Aadhaar still active for MSME registration?", a: "No, Udyog Aadhaar is no longer used for new registrations. Existing holders can check their UAN or migrate to Udyam for updated benefits and seamless verification." },
  { id: 76, category: "udyog-aadhaar", q: "How do I find my Udyog Aadhaar Number (UAN)?", a: "Retrieve your UAN by visiting the Udyog Aadhaar portal and entering your registered mobile number. Verify via OTP to access your existing UAN details instantly." },
  { id: 77, category: "registration", q: "Can I still register under Udyog Aadhaar?", a: "No, Udyog Aadhaar registration is discontinued. All new businesses must register via the Udyam portal for MSME recognition and access to government benefits." },
  { id: 78, category: "udyog-aadhaar", q: "How do I update my Udyog Aadhaar details?", a: "Existing Udyog Aadhaar details can be updated on the old portal using your UAN and mobile OTP. However, migration to Udyam is recommended for all future updates and benefits." },
  { id: 79, category: "udyog-aadhaar", q: "What is the Udyog Aadhaar gov.in portal used for?", a: "The portal was originally used for MSME registration under the old system. Today it helps existing users check UAN details and redirects new applicants to Udyam Registration." },
  { id: 80, category: "registration", q: "What services are available on the Udyam Registration portal?", a: "The portal allows MSME registration, certificate download, detail edits, URN verification and access to government MSME schemes — a single-stop digital platform for MSME management." },
  { id: 81, category: "download-print", q: "How can I download my Udyam Aadhaar certificate in PDF format?", a: "Enter your URN or Aadhaar on the portal, complete OTP verification, and download the certificate instantly in PDF. The file is valid for banks, tenders and government submissions." },
  { id: 82, category: "registration", q: "Is MSME registration completely free?", a: "Yes, Udyam registration is fully free. There are no fees or charges, and all downloads, reprints and updates of the certificate are also free of cost." },
  { id: 83, category: "registration", q: "Is udyamregistration.gov.in the official MSME registration website?", a: "Yes, udyamregistration.gov.in is the only government-authorised portal for MSME registration, certificate download and verification, ensuring secure and authentic records." },
  { id: 84, category: "download-print", q: "How can I download my MSME Registration Certificate?", a: "Enter your Udyam Number or Aadhaar on the portal, complete OTP verification, and download the certificate PDF. It can be printed or saved digitally for official use." },
  { id: 85, category: "download-print", q: "How do I download my Udyam Certificate online?", a: "Visit the Udyam portal, enter your URN, complete OTP verification, and download the certificate PDF instantly. It is recognised for every MSME-related purpose." },
  { id: 86, category: "download-print", q: "How can I print my Udyam Registration Certificate online?", a: "Download the certificate PDF from the portal after OTP verification and print it using any standard printer. The printed copy is valid for bank, tender and government submissions." },
  { id: 87, category: "download-print", q: "What details are required to print my Udyam Certificate?", a: "You need your Udyam Registration Number and access to the mobile number linked to your Aadhaar. OTP verification ensures secure download and printing." },
  { id: 88, category: "registration", q: "How do I submit a new Udyam Application for MSME registration?", a: "Visit the Udyam portal, enter Aadhaar, fill business details and complete OTP verification. Submission is instant, and your MSME registration certificate is generated digitally." },
  { id: 89, category: "download-print", q: "Where can I print my MSME Certificate online?", a: "You can print your certificate directly from the Udyam portal by entering your URN and completing OTP verification. The PDF can be printed for loans, tenders and official documentation." },
  { id: 90, category: "download-print", q: "What should I do if I cannot find my MSME/Udyam Number to print the certificate?", a: "Use the “Forgot Udyam Number” option on the portal. Verify with your mobile OTP, retrieve your Udyam Number, and download the certificate securely." },
  { id: 91, category: "udyog-aadhaar", q: "Can I still apply for a new Udyog Aadhaar Registration today?", a: "No, Udyog Aadhaar is discontinued. New businesses must register under Udyam Registration to access MSME benefits and current government schemes." },
  { id: 92, category: "udyog-aadhaar", q: "How do I migrate my old Udyog Aadhaar (UAN) to the new Udyam Registration system?", a: "Enter your Aadhaar and UAN on the Udyam portal, verify via OTP, update business details and submit. Your new Udyam certificate will be issued instantly upon successful migration." },
  { id: 93, category: "download-print", q: "How can I download my Udyam Registration Certificate online?", a: "Enter your URN or Aadhaar on the portal, complete OTP verification, and download the PDF certificate immediately. It serves as valid MSME proof for banks and government schemes." },
  { id: 94, category: "troubleshooting", q: "What is Udyam Aadhaar in MSME registration?", a: "Udyam Aadhaar is the digital MSME registration system that uses Aadhaar authentication. It provides a unique Udyam Number and enables access to government MSME schemes and benefits." },
  { id: 95, category: "registration", q: "How do I apply for MSME registration online?", a: "Use the Udyam portal, enter Aadhaar, provide basic business details, verify via OTP, and submit. Registration is instant, free and paperless." },
  { id: 96, category: "download-print", q: "Where can I download my Udyam Certificate in PDF format?", a: "Visit the official Udyam portal, enter your URN or Aadhaar, verify via OTP, and download the certificate PDF for official or business use." },
  { id: 97, category: "fees-benefits", q: "What is an MSME Certificate and why is it important?", a: "An MSME Certificate verifies your MSME status under Udyam. It is crucial for applying for loans, subsidies, tenders and availing government support programmes designed for small enterprises." },
  { id: 98, category: "download-print", q: "How can I get my MSME certificate online?", a: "Register on the Udyam portal using Aadhaar, complete OTP verification, and download your MSME certificate in PDF format instantly." },
  { id: 99, category: "download-print", q: "How do I download my Udyam Aadhaar certificate?", a: "Enter your Udyam Number on the portal, complete OTP verification, and download your Aadhaar-linked certificate in PDF for official use." },
  { id: 100, category: "download-print", q: "Can I download my Udyam Aadhaar certificate again if I lost it?", a: "Yes, you can re-download your certificate anytime by verifying via OTP using your registered Aadhaar-linked mobile number." },
  { id: 101, category: "download-print", q: "How can I download my Udyam Aadhaar certificate online?", a: "Visit the Udyam portal, verify your Aadhaar-linked mobile number, and download the certificate in PDF format instantly." },
  { id: 102, category: "download-print", q: "How do I print my Udyam certificate?", a: "After downloading the PDF from the Udyam portal, use any printer to print your certificate for official MSME submissions." },
  { id: 103, category: "download-print", q: "What is the process to print my Udyam Certificate?", a: "Enter your URN, download the PDF after OTP verification, and print it. This printed certificate can be used for loans, tenders or official purposes." },
  { id: 104, category: "download-print", q: "How can I print my Udyam Registration details?", a: "Log in with Aadhaar OTP, download your certificate PDF, and print it for submission to banks, government departments or clients." },
  { id: 105, category: "download-print", q: "Can I download and print my Udyam certificate anytime?", a: "Yes, the certificate can be downloaded and printed at any time via the Udyam portal using URN and OTP verification." },
  { id: 106, category: "download-print", q: "How do I reprint my Udyam Registration certificate?", a: "Reprinting is simple — log in using URN or Aadhaar, complete OTP verification, and download the certificate again for printing." },
  { id: 107, category: "download-print", q: "How can I print the Udyam Certificate for bank submission?", a: "Download the PDF from the portal and print it. Banks accept the printed copy for loan applications, collateral verification and MSME benefits." },
  { id: 108, category: "download-print", q: "Is it possible to print the MSME Udyam Certificate online?", a: "Yes, after OTP verification, download the certificate from the portal and print it for official and business purposes." },
  { id: 109, category: "download-print", q: "Can I print my Udyam Certificate using Aadhaar authentication?", a: "Yes, Aadhaar OTP verification enables secure access to download and print your Udyam certificate digitally." },
  { id: 110, category: "download-print", q: "How do I print my MSME certificate online?", a: "Enter your URN on the portal, complete OTP verification, download the PDF, and print it for government, bank or tender submissions." },
  { id: 111, category: "download-print", q: "How can I print my MSME Udyam certificate?", a: "Download the certificate PDF via OTP verification on the Udyam portal and print it for loans, tenders and official documentation." },
  { id: 112, category: "download-print", q: "Where can I download and print my Udyam Certificate?", a: "Use your URN on the official Udyam portal, verify via OTP, download the certificate PDF, and print it easily." },
  { id: 113, category: "download-print", q: "How do I print my Udyam certificate along with the annexure?", a: "Select the “Print with Annexure” option on the portal after OTP verification to download and print both the certificate and annexure together." },
  { id: 114, category: "download-print", q: "How can I download my updated Udyam Aadhaar certificate?", a: "Verify your Aadhaar-linked mobile, enter your URN, and download the updated certificate PDF from the portal — it will reflect your current business details." },
  { id: 115, category: "udyog-aadhaar", q: "How do I download my old Udyog Aadhaar (UAN) certificate?", a: "Enter your UAN and registered mobile number on the Udyog Aadhaar portal to download it. You can also migrate the details to Udyam for an updated registration." },
];

export function getFaqsByCategory(key: FaqCategoryKey): Faq[] {
  return FAQS.filter((f) => f.category === key);
}

export function getPopularFaqs(limit = 8): Faq[] {
  return FAQS.filter((f) => f.popular).slice(0, limit);
}
