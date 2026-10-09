import { InfoPage } from '@/components/InfoPage';

export default function DisclaimerScreen() {
  return (
    <InfoPage
      title="Medical disclaimer"
      sections={[
        {
          heading: 'Doc Pawi is not a doctor',
          body: [
            'Doc Pawi provides general health information and helps you organize your own records. It is not a medical device and is not a substitute for advice, diagnosis, or treatment from a licensed healthcare professional.',
            'AI-generated content can be wrong or incomplete. Do not make medical decisions based only on Doc Pawi.',
          ],
        },
        {
          heading: 'Medications',
          body: [
            'Doc Pawi never prescribes, starts, stops, or changes medications or doses. Follow your prescriber’s instructions and ask a pharmacist or doctor about any change.',
            'Reminders are a convenience and can be delayed by your phone. They do not replace your own medication routine.',
          ],
        },
        {
          heading: 'Emergencies',
          body: [
            'If you think you may have a medical emergency — such as chest pain, difficulty breathing, signs of stroke, severe bleeding, a severe allergic reaction, or thoughts of harming yourself — call 911 (the Philippine national emergency hotline) or your local emergency number, or go to the nearest emergency department immediately.',
          ],
        },
        {
          heading: 'Your records',
          body: [
            'Information you enter or confirm is only as accurate as its source. Values read from documents may contain recognition errors; always compare them with the original.',
            'HMO coverage and accreditation details are what you entered and are not verified by Doc Pawi.',
          ],
        },
      ]}
    />
  );
}
