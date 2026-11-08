import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Button,
} from "@react-email/components";

const SERVICES_DATA: Record<string, any> = {
  new_udyam: {
    label: "New Udyam Registration",
    subject: "Action Required: Complete Your Details to Start Udyam Registration – Order No. [ORDER NUMBER]",
    intro: "Thank you for choosing our New Udyam Registration service. To initiate your registration with the concerned authority, we require certain details and documents from you.",
    fields: [
      "Aadhaar number", "Name as per Aadhaar", "Type of organisation", "PAN number, PAN card holder name & date of birth",
      "Whether ITR was filed for PY 2024–25", "GSTIN status", "Written-down value (WDV) of plant & machinery",
      "Exclusion amount for pollution control / R&D / industrial safety devices", "Total turnover during 2024–25",
      "Name of enterprise", "Mobile number (+91) & email address", "Social category", "Gender & specially abled status",
      "Official address of enterprise", "Previous EM-II / UAM registration number", "Date of incorporation / registration",
      "Whether production/business has commenced & date of commencement", "Bank name, IFSC code & account number",
      "Major activity of unit (Manufacturing / Services)", "NIC code (2-digit, 4-digit & 5-digit)",
      "Number of persons employed", "Interest in GeM / TReDS / NCS / NSIC B2B / Skill India Digital portals",
    ],
  },
  update_udyam: {
    label: "Update Udyam Certificate",
    subject: "Action Required: Provide Your Udyam Details for Updation – Order No. [ORDER NUMBER]",
    intro: "Thank you for placing your order for Udyam Certificate Updation. To process this request, we require the following details from you.",
    fields: ["Udyam Registration Number", "Registered mobile number linked to your Udyam account"],
  },
  download_udyam: {
    label: "Download Udyam Certificate",
    subject: "Action Required: Share Your Details to Download Your Udyam Certificate – Order No. [ORDER NUMBER]",
    intro: "Thank you for your order for Udyam Certificate Download. Please share the following details so we can retrieve and deliver your certificate.",
    fields: ["Udyam Registration Number", "Registered mobile number linked to your Udyam account"],
  },
  migrate_udyam: {
    label: "Migrate",
    subject: "Action Required: Provide Your Udyog Aadhaar Details for Migration – Order No. [ORDER NUMBER]",
    intro: "Thank you for choosing our Udyog Aadhaar to Udyam Migration service. To proceed with the migration, please provide the following information.",
    fields: ["Udyog Aadhaar Number – 12-digit"],
  },
  forgot_contact: {
    label: "Forgot Registered Mobile / Email",
    subject: "Action Required: Documents & Details Needed for Your Recovery Request – Order No. [ORDER NUMBER]",
    intro: "Thank you for your order for Forgot Registered Mobile / Email recovery. To raise your complaint with the concerned authority, we need the details and documents listed below.",
    fields: [
      "User type", "Aadhaar number", "Name as per Aadhaar", "Address as per Aadhaar", "PAN card number",
      "Pin code, state & district", "New email ID to be linked", "New mobile number to be linked",
      "Upload Aadhaar card (PDF)", "Upload PAN card (PDF)", "Download and sign application form",
    ],
  },
  correct_pan: {
    label: "Correct PAN / Aadhaar Name in Udyam",
    subject: "Action Required: Provide Your Udyam Details for Name Correction – Order No. [ORDER NUMBER]",
    intro: "Thank you for your order for PAN / Aadhaar Name Correction in Udyam. Please share the following details so we can initiate the correction process.",
    fields: ["Udyam Registration Number", "Registered mobile number linked to your Udyam account"],
  },
  talk_expert: {
    label: "Talk to Expert",
    subject: "Action Required: Tell Us About Your Requirement – Order No. [ORDER NUMBER]",
    intro: "Thank you for choosing our Talk to Expert service. To connect you with the right assistance, please fill in a few quick details.",
    fields: [
      "Your full name & contact number", "Brief description of requirement",
      "Preferred language for consultation", "Preferred time / slot for a call",
      "Existing Udyam / UAM registration number",
    ],
  },
};

interface ClientInfoRequestProps {
  customerName?: string;
  orderNumber?: string;
  formLink?: string;
  serviceKey?: string;
  businessName?: string;
}

export const ClientInfoRequestTemplate = ({
  customerName = "[Customer Name]",
  orderNumber = "[ORDER NUMBER]",
  formLink = "[FORM LINK]",
  serviceKey = "new_udyam",
  businessName = "Udyam Adhar",
}: ClientInfoRequestProps) => {
  const svc = SERVICES_DATA[serviceKey] || SERVICES_DATA.new_udyam;

  return (
    <Html>
      <Head />
      <Preview>{svc.label} - Action Required</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Dear {customerName},</Heading>
          <Text style={text}>
            Greetings from <strong>{businessName}</strong>.
          </Text>
          <Text style={text}>{svc.intro}</Text>
          <Text style={text}>
            To provide the required information, please click the button below to open your personalised form. It only takes a few minutes.
          </Text>
          
          <Section style={fieldBox}>
            <Text style={fieldHeader}>INFORMATION WE NEED FROM YOU</Text>
            {svc.fields.map((f: string, i: number) => (
              <Text key={i} style={fieldItem}>→ {f}</Text>
            ))}
          </Section>

          <Section style={btnContainer}>
            <Button style={button} href={formLink}>
              Fill Your Details →
            </Button>
            <Text style={note}>
              This link is unique to your order. Please do not share it with others.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={orderDetails}>
            <Text style={detailText}>
              <strong>Order / Application No.:</strong> {orderNumber}
            </Text>
            <Text style={detailText}>
              <strong>Service:</strong> {svc.label}
            </Text>
            <Text style={detailText}>
              Our team will begin processing your request within <strong>24 working hours</strong> of receiving your completed form.
              If you face any difficulty filling in the form, please reply to this email and we will assist you promptly.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={disclaimer}>
            {businessName} is a private consultancy and assistance service provider. We are not affiliated with, authorized by, endorsed by, or associated with any government authority or department.
          </Text>

          <Section style={footer}>
            <Text style={footerText}>Warm regards,</Text>
            <Text style={footerName}>Team {businessName}</Text>
            <Text style={footerContact}>help@businesshelpservices.com | udyamadhar.in</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default ClientInfoRequestTemplate;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "600px",
};

const h1 = {
  color: "#333",
  fontSize: "20px",
  fontWeight: "bold",
  margin: "0 0 20px",
};

const text = {
  color: "#555",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 15px",
};

const fieldBox = {
  backgroundColor: "#f0f4ff",
  borderLeft: "4px solid #4f46e5",
  padding: "20px",
  borderRadius: "0 8px 8px 0",
  margin: "20px 0",
};

const fieldHeader = {
  color: "#4f46e5",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
  margin: "0 0 10px",
};

const fieldItem = {
  color: "#444",
  fontSize: "13px",
  margin: "5px 0",
};

const btnContainer = {
  textAlign: "center" as const,
  margin: "30px 0",
};

const button = {
  backgroundColor: "#4f46e5",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const note = {
  color: "#999",
  fontSize: "11px",
  marginTop: "10px",
};

const hr = {
  borderColor: "#eee",
  margin: "30px 0",
};

const orderDetails = {
  color: "#777",
  fontSize: "12px",
};

const detailText = {
  margin: "4px 0",
};

const disclaimer = {
  color: "#aaa",
  fontSize: "11px",
  fontStyle: "italic",
  margin: "20px 0",
};

const footer = {
  marginTop: "20px",
};

const footerText = {
  color: "#555",
  fontSize: "14px",
  margin: "0",
};

const footerName = {
  color: "#333",
  fontSize: "14px",
  fontWeight: "bold",
  margin: "2px 0 0",
};

const footerContact = {
  color: "#aaa",
  fontSize: "12px",
  margin: "8px 0 0",
};
