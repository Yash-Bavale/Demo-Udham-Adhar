UPDATE public.email_templates
SET subject = 'Action Required: Incomplete Information Order On Hold. Order No. {{order_number}}',
    body_html = $E002HTML$<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Action Required: Submit Required Information/Documents – Order No. {{order_number}}</title>
</head>

<body style="margin:0; padding:0; background:#F2F4F7;">
    <!-- From: help@businesshelpservices.com | Display Name: Care | Business Help Services | Subject: Action Required: Incomplete Information Order On Hold. Order No. {{order_number}} -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(18,49,92,0.08);">

                    <tr>
                        <td style="background:#12315C; padding:18px 30px; border-radius:10px 10px 0 0;">
                            <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:17px; font-weight:700; color:#ffffff;">Action Required: Incomplete Information - Order On Hold. </span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">
                            <p style="margin:0 0 14px 0; font-weight:700; color:#12315C;">Dear {{customer_name}},</p>
                            <p style="margin:0 0 12px 0;">Greetings from Business Help Services.</p>
                            <p style="margin:0 0 12px 0;">This is with reference to your Order No. {{order_number}} for {{service_name}}.</p>
                            <p style="margin:0 0 12px 0;">Your order has been successfully Received and is currently on Hold. To proceed further with the requested consultancy and assistance service, we require certain information, supporting documents, confirmations, and/or verification from your side.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Order Summary</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:14px 30px 0 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border:1px solid #E3E6EC; border-radius:6px;">
                                <tr>
                                    <td style="padding:14px 16px 4px 16px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order No.</td>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_number}}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Requested Service</td>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{service_name}}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Current Order Status</td>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">Awaiting Customer Information</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Order Created On</td>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{order_created_at}}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Email</td>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_email}}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#5B6270; width:46%; border-bottom:1px solid #E3E6EC; vertical-align:top;">Registered Mobile</td>
                                                <td style="padding:8px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; color:#2B2E33; font-weight:600; border-bottom:1px solid #E3E6EC; vertical-align:top;">{{customer_mobile}}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Action Required</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">To enable us to proceed with your requested service, kindly submit the required information, supporting documents ({{document_checklist}}), and verification details through the secure submission link provided below.</td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:18px 30px 4px 30px;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background:#12315C; border-radius:5px;">
                                        <a href="{{form_link}}" style="display:inline-block; padding:13px 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; letter-spacing:0.3px;">Submit Required Information / Documents</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:14px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Please ensure that all information and documents submitted are complete, accurate, authentic, legible, and relate to the requested service.</td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Important Service Information</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:10px 30px 0 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Business Help Services operates as a private consultancy and assistance service provider.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>We are not affiliated with, authorized by, endorsed by, or associated with any Government authority, department, ministry, statutory body, or official Government portal.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Submission of complete and accurate information helps avoid unnecessary delays during operational review and service processing.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Depending upon the requested service, additional documents, clarification, verification, customer confirmation, or OTP verification may be required before further processing can continue.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Business Help Services may communicate with you through your registered Email, Phone Call, WhatsApp, SMS, or other written communication channels regarding verification, documentation, clarification, operational updates, or service-related assistance.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Customers are advised to regularly check their Inbox, Spam, and Junk folders to ensure that no important service-related communication is missed.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Customer Responsibility</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:10px 30px 0 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Customers are responsible for ensuring that all information, supporting documents, contact details, OTPs, confirmations, and approvals submitted are complete, accurate, authentic, valid, and up to date.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Business Help Services shall not be responsible for delays, rejection, or operational issues arising due to incorrect, incomplete, misleading, illegible, expired, or fraudulent information or documents provided by the customer.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Submission of information or documents does not by itself guarantee approval, registration, issuance of any certificate, or acceptance by any Government authority, statutory body, or third party, wherever applicable.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Customer Response &amp; Order Closure</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:10px 30px 0 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Timely submission of the requested information, supporting documents, confirmations, and verification details is essential for processing your order.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>If the requested information or documents are not submitted, remain incomplete, inaccurate, or are not provided within a reasonable period despite our communications and reminders, Business Help Services may be unable to proceed with the requested consultancy and assistance service.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>In such circumstances, your order may be placed on hold, operationally closed, or treated as incomplete due to non-submission or incomplete submission of the required information or documents.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Where consultation, documentation review, verification, coordination, follow-up, communication, or other professional service activities have already commenced, refund eligibility, if any, shall be governed strictly in accordance with the applicable Refund &amp; Cancellation Policy published on our website.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Operational closure of an order due to non-submission or incomplete submission of the required information or documents shall not be construed as completion of the requested service or as a deficiency in service on the part of Business Help Services.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Order Processing Information</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:10px 30px 0 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Your order will remain under operational review until the required information and documents are successfully received and verified.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>After successful submission and verification of the required information, further processing of your order will continue.</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13.5px; line-height:1.65; color:#2B2E33; vertical-align:top;"><span style="color:#C9A227; font-weight:700;">&#8226;&nbsp;</span>Additional communication may be sent whenever further customer action, clarification, verification, or documentation is required.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:26px 30px 8px 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-bottom:2px solid #C9A227; padding-bottom:8px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:0.8px; color:#12315C; text-transform:uppercase;">Support Information</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">If you require any clarification regarding the requested information or document submission process, kindly reply to this email or contact our Customer Care Team during business hours.</td>
                    </tr>
                    <tr>
                        <td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">Customer Care Availability<br />Monday to Saturday<br />10:00 AM to 6:00 PM (IST)<br />(Excluding National and Public Holidays)</td>
                    </tr>
                    <tr>
                        <td style="padding:14px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14.5px; line-height:1.7; color:#2B2E33;">For complete details regarding our services and applicable policies, please refer to the following pages on our website:</td>
                    </tr>
                    <tr>
                        <td style="padding:14px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; color:#12315C;">IMPORTANT LINKS</td>
                    </tr>
                    <tr>
                        <td style="padding:12px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12.5px; color:#5B6270; line-height:2;"><a href="https://udyamadhar.in/terms-conditions" style="color:#12315C; text-decoration:none; font-weight:600;">Terms &amp; Conditions</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/refund-cancellation-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Refund &amp; Cancellation Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/privacy-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Privacy Policy</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/disclaimer" style="color:#12315C; text-decoration:none; font-weight:600;">Disclaimer</a> &nbsp;|&nbsp; <a href="https://udyamadhar.in/service-delivery-policy" style="color:#12315C; text-decoration:none; font-weight:600;">Service Delivery Policy</a></td>
                    </tr>
                    <tr>
                        <td style="padding:24px 30px 0 30px; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:14px; line-height:1.7; color:#2B2E33;">
                            <p style="margin:0 0 6px 0;">Regards,<br />{{executive_name}}<br />Customer Care Team</p>
                            <p style="margin:14px 0 0 0; font-weight:700; color:#12315C;">Business Help Services</p>
                            <p style="margin:2px 0 0 0; color:#5B6270; font-size:13px;">Private Consultancy &amp; Assistance Services</p>
                            <p style="margin:10px 0 0 0; font-size:13.5px;">&#128222; +91-9767870331 &nbsp;&nbsp; &#128231; help@businesshelpservices.com &nbsp;&nbsp; &#127760; www.udyamadhar.in</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:22px 30px 0 30px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7; border-radius:6px; border:1px solid #E3E6EC;">
                                <tr>
                                    <td style="padding:14px 16px;">
                                        <span style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11.5px; font-weight:700; letter-spacing:0.6px; color:#12315C; text-transform:uppercase;">Important Notice</span>
                                        <p style="margin:8px 0 0 0; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#5B6270;">This is an automatically generated system email regarding your order. Please submit the requested information and documents only through the secure submission link provided in this email unless otherwise instructed by Business Help Services. Your personal information and documents will be handled in accordance with our Privacy Policy and used solely for providing the requested consultancy and assistance services. Business Help Services maintains electronic records of order processing, customer communications, document submissions, and service-related activities for operational, compliance, audit, and record-keeping purposes.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 30px 26px 30px; text-align:center; font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11px; color:#5B6270;">&copy; Business Help Services &middot; www.udyamadhar.in</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>

</html>$E002HTML$,
    updated_at = now()
WHERE code = 'E002';