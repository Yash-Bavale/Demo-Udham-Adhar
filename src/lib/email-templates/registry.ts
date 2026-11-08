import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { ClientInfoRequestTemplate } from './client-info-request';

export const TEMPLATES: Record<string, TemplateEntry> = {
  'client-info-request': {
    component: ClientInfoRequestTemplate,
    subject: (data) => {
      const subjects: Record<string, string> = {
        new_udyam: "Action Required: Complete Your Details to Start Udyam Registration – Order No. {{orderNumber}}",
        update_udyam: "Action Required: Provide Your Udyam Details for Updation – Order No. {{orderNumber}}",
        download_udyam: "Action Required: Share Your Details to Download Your Udyam Certificate – Order No. {{orderNumber}}",
        migrate_udyam: "Action Required: Provide Your Udyog Aadhaar Details for Migration – Order No. {{orderNumber}}",
        forgot_contact: "Action Required: Documents & Details Needed for Your Recovery Request – Order No. {{orderNumber}}",
        correct_pan: "Action Required: Provide Your Udyam Details for Name Correction – Order No. {{orderNumber}}",
        talk_expert: "Action Required: Tell Us About Your Requirement – Order No. {{orderNumber}}",
      };
      const raw = subjects[data.serviceKey] || subjects.new_udyam;
      return raw.replace("{{orderNumber}}", data.orderNumber || "[ORDER NUMBER]");
    },
    displayName: "Client Info Request (uploaded template)",
    previewData: {
      customerName: "John Doe",
      orderNumber: "UA12345",
      formLink: "https://udyamadhar.in/onboarding/UA12345",
      serviceKey: "new_udyam"
    }
  }
}
