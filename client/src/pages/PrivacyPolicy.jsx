export default function PrivacyPolicy() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 className="page-title">Privacy Policy</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Last updated: [DATE]
        </p>

        <section style={{ marginBottom: '2rem' }}>
          <h2>1. Introduction</h2>
          <p>
            [ORGANIZATION NAME] ("we", "our", or "us") operates the Voice Crowdsourcing Platform
            (the "Service"). This Privacy Policy explains how we collect, use, disclose, and
            safeguard your information when you use our Service.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>2. Information We Collect</h2>

          <h3>2.1 Account Information</h3>
          <p>When you register, we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (stored securely using bcrypt hashing)</li>
            <li>Account creation date</li>
            <li>Consent timestamps</li>
          </ul>

          <h3>2.2 Voice Recordings</h3>
          <p>When you contribute to the platform, we collect:</p>
          <ul>
            <li>Audio recordings of your voice (WAV format, 16kHz)</li>
            <li>Recording duration and quality metrics</li>
            <li>The text/prompt you were reading</li>
            <li>Timestamp of recording</li>
          </ul>

          <h3>2.3 Validation Data</h3>
          <p>When you validate recordings, we collect:</p>
          <ul>
            <li>Your quality ratings (1-5 scale)</li>
            <li>Timestamp of validation</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>3. How We Use Your Information</h2>
          <p>We use the collected information for:</p>
          <ul>
            <li>Creating and managing your account</li>
            <li>Building speech recognition/synthesis training datasets</li>
            <li>Quality control through community validation</li>
            <li>Improving the Service</li>
            <li>Communicating with you about the Service</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>4. Data Sharing and Disclosure</h2>
          <p>
            Voice recordings may be included in datasets shared with researchers or made publicly
            available for speech technology development. When shared:
          </p>
          <ul>
            <li>Recordings are associated with anonymized user IDs, not email addresses</li>
            <li>You can choose to have your recordings anonymized or deleted (see Section 6)</li>
          </ul>
          <p>
            We do not sell your personal information to third parties.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>5. Data Retention</h2>
          <p>
            We retain your account information and recordings for as long as your account is active
            or as needed to provide the Service. Anonymized recordings may be retained indefinitely
            as part of training datasets.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>6. Your Rights (GDPR)</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access:</strong> Export all your personal data from your Profile page</li>
            <li><strong>Rectification:</strong> Update your account information</li>
            <li><strong>Erasure:</strong> Delete your account and all associated data</li>
            <li><strong>Portability:</strong> Download your data in JSON format</li>
            <li><strong>Withdraw Consent:</strong> Revoke recording consent at any time</li>
          </ul>
          <p>
            You can also choose to anonymize your recordings (keeping them in the dataset
            without personal identification) instead of complete deletion.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>7. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your
            personal data, including:
          </p>
          <ul>
            <li>Secure password hashing (bcrypt)</li>
            <li>HTTPS encryption for data in transit</li>
            <li>Access controls for stored data</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>8. Children's Privacy</h2>
          <p>
            Our Service is not intended for children under 16 years of age. We do not knowingly
            collect personal information from children under 16.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any
            changes by posting the new Privacy Policy on this page and updating the "Last updated"
            date.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>10. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:
          </p>
          <p>
            [CONTACT EMAIL]<br />
            [ORGANIZATION ADDRESS]
          </p>
        </section>
      </div>
    </div>
  );
}
