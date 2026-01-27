export default function TermsOfService() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 className="page-title">Terms of Service</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Last updated: [DATE]
        </p>

        <section style={{ marginBottom: '2rem' }}>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Voice Crowdsourcing Platform (the "Service") operated by
            [ORGANIZATION NAME] ("we", "our", or "us"), you agree to be bound by these Terms of
            Service. If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>2. Description of Service</h2>
          <p>
            The Service is a crowdsourcing platform for collecting voice recordings to build
            speech recognition and synthesis datasets. Users can:
          </p>
          <ul>
            <li>Record audio of text prompts or musical notation</li>
            <li>Validate other users' recordings for quality</li>
            <li>Contribute to open speech technology research</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>3. User Accounts</h2>
          <p>
            To use the Service, you must create an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate and complete registration information</li>
            <li>Maintain the security of your password</li>
            <li>Accept responsibility for all activities under your account</li>
            <li>Notify us immediately of any unauthorized use</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>4. Content License</h2>

          <h3>4.1 Your Recordings</h3>
          <p>
            By submitting voice recordings to the Service, you grant [ORGANIZATION NAME] a
            worldwide, royalty-free, non-exclusive, perpetual license to:
          </p>
          <ul>
            <li>Use, reproduce, and distribute your recordings</li>
            <li>Include your recordings in training datasets</li>
            <li>Share your recordings with researchers and the public</li>
            <li>Create derivative works (e.g., speech models) from your recordings</li>
          </ul>

          <h3>4.2 Dataset License</h3>
          <p>
            Datasets created from user contributions may be released under [LICENSE TYPE, e.g.,
            CC0, CC-BY, or custom license]. You acknowledge that your contributions may become
            part of publicly available datasets.
          </p>

          <h3>4.3 Moral Rights</h3>
          <p>
            To the extent permitted by law, you waive any moral rights in your recordings,
            including the right to be identified as the author.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Submit recordings that are not your own voice</li>
            <li>Submit recordings containing offensive, illegal, or inappropriate content</li>
            <li>Attempt to manipulate or game the validation system</li>
            <li>Use automated tools to submit low-quality recordings</li>
            <li>Interfere with the proper functioning of the Service</li>
            <li>Violate any applicable laws or regulations</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>6. Quality Standards</h2>
          <p>
            Recordings must meet minimum quality standards:
          </p>
          <ul>
            <li>Clear audio without excessive background noise</li>
            <li>Accurate reading of the provided text</li>
            <li>Appropriate duration (not too short or too long)</li>
            <li>No inappropriate content</li>
          </ul>
          <p>
            We reserve the right to remove recordings that do not meet these standards.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>7. Privacy</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy, which is incorporated
            into these Terms by reference. Please review our Privacy Policy to understand how we
            collect, use, and protect your information.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>8. Termination</h2>
          <p>
            We may terminate or suspend your account at any time for violation of these Terms.
            You may delete your account at any time through your Profile settings. Upon
            termination, you may choose to:
          </p>
          <ul>
            <li>Delete all your data, including recordings</li>
            <li>Anonymize your recordings (keeping them in the dataset without identification)</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>9. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
            WE DO NOT GUARANTEE THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, [ORGANIZATION NAME] SHALL NOT BE LIABLE FOR
            ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM
            YOUR USE OF THE SERVICE.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>11. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. We will notify users of significant changes
            by posting a notice on the Service or sending an email. Continued use of the Service
            after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>12. Governing Law</h2>
          <p>
            These Terms shall be governed by the laws of [JURISDICTION], without regard to
            conflict of law principles.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>13. Contact</h2>
          <p>
            For questions about these Terms, please contact:
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
