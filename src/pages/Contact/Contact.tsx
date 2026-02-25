// src/pages/Contact/Contact.tsx
export default function Contact() {
  return (
    <section className="bg-linear-to-b from-primary-light/10 to-white py-20">
      <div className="container mx-auto max-w-6xl px-6">

        {/* Main heading */}
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-primary text-center mb-12">
          Get in Touch
        </h1>

        {/* Intro paragraph */}
        <p className="text-lg md:text-xl text-gray-700 text-center max-w-3xl mx-auto mb-16">
          We’d love to hear from you! Whether you have questions, feedback, or want to make a reservation, reach out and we’ll respond as soon as possible.
        </p>

        {/* Contact grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

          {/* Contact form */}
          <form className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8 flex flex-col gap-6">
            <input
              type="text"
              placeholder="Your Name"
              className="input"
              required
            />
            <input
              type="email"
              placeholder="Email Address"
              className="input"
              required
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              className="input"
            />
            <textarea
              placeholder="Your Message"
              className="input h-32 resize-none"
              required
            />
            <button
              type="submit"
              className="bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-dark transition-colors duration-300"
            >
              Send Message
            </button>
          </form>

          {/* Contact info */}
          <div className="flex flex-col justify-between gap-8">
            <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8">
              <h3 className="text-2xl font-semibold mb-4 text-primary">Visit Us</h3>
              <p className="text-gray-700">
                123 Flavor Street<br />
                Culinary City, FL 12345
              </p>
              <p className="mt-2 text-gray-700">Open Daily: 11:00 AM - 10:00 PM</p>
            </div>

            <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8">
              <h3 className="text-2xl font-semibold mb-4 text-primary">Contact</h3>
              <p className="text-gray-700">Phone: (123) 456-7890</p>
              <p className="text-gray-700 mt-2">Email: hello@sofisrestaurant.com</p>
              <p className="text-gray-700 mt-2">Follow us on social media for updates!</p>
            </div>

            <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8 h-64 flex items-center justify-center text-gray-400 text-lg italic">
              Map Placeholder
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}