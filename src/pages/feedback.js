import React, { useState } from 'react';
import Link from 'next/link';

const Feedback = () => {
  const [formData, setFormData] = useState({
    rating: '5',
    difficulty: '3',
    informational: '',
    interesting: '',
    comments: '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    let val = value;

    if (type === 'radio') {
      val = e.target.checked ? value : formData[name];
    }

    setFormData({ ...formData, [name]: val });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // For testing, we'll just log the data
    console.log(formData);
    setSubmitted(true);
    setFormData({

      rating: '5',
      difficulty: '3',
      informational: '',
      interesting: '',
      comments: '',
    });
  };

  return (
    <>
      {/* App Bar with Navigation Buttons */}
      <nav
        style={{
          background: 'linear-gradient(to right, #2563eb, #1d4ed8)',
          padding: '0.75rem 1.5rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Logo or Brand Name could go here */}
          <div style={{ fontWeight: 'bold', color: 'white' }}>
            AI Personalized Healthcare Safety Module
          </div>

          {/* Navigation Links */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
            }}
          >
            <Link
              href="/"
              style={{
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                transition: 'background-color 0.2s ease',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              style={{
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                transition: 'background-color 0.2s ease',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              Dashboard
            </Link>
            <Link
              href="/feedback"
              style={{
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                transition: 'background-color 0.2s ease',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              Feedback
            </Link>
          </div>
        </div>
      </nav>

      <div
        className="feedback-container"
        style={{
          maxWidth: '600px',
          margin: '2rem auto',
          padding: '1rem',
        }}
      >
        <h1 className="feedback-title">Service Feedback</h1>
        {submitted && (
          <p
            className="feedback-success"
            style={{ color: 'green', marginBottom: '1rem' }}
          >
            Thank you for your feedback!
          </p>
        )}
        {error && (
          <p
            className="feedback-error"
            style={{ color: 'red', marginBottom: '1rem' }}
          >
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="feedback-form">
          {/* Name Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
          
         
          </div>

          {/* Email Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
            
          </div>

          {/* Overall Rating Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
            <label
              htmlFor="rating"
              style={{ display: 'block', marginBottom: '0.5rem' }}
            >
              Overall Rating
            </label>
            <select
              id="rating"
              name="rating"
              value={formData.rating}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #ccc',
              }}
            >
              <option value="5">★★★★★ - Excellent</option>
              <option value="4">★★★★☆ - Very Good</option>
              <option value="3">★★★☆☆ - Good</option>
              <option value="2">★★☆☆☆ - Fair</option>
              <option value="1">★☆☆☆☆ - Poor</option>
            </select>
          </div>

          {/* Difficulty of Questions Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
            <label
              htmlFor="difficulty"
              style={{ display: 'block', marginBottom: '0.5rem' }}
            >
              Difficulty of Questions
            </label>
            <select
              id="difficulty"
              name="difficulty"
              value={formData.difficulty}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #ccc',
              }}
            >
              <option value="1">1 - Very Easy</option>
              <option value="2">2 - Easy</option>
              <option value="3">3 - Moderate</option>
              <option value="4">4 - Difficult</option>
              <option value="5">5 - Very Difficult</option>
            </select>
          </div>

          {/* Informational Case Study Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
            <label
              style={{ display: 'block', marginBottom: '0.5rem' }}
            >
              Was the case study informational?
            </label>
            <div
              className="radio-group"
              style={{ display: 'flex', gap: '1rem' }}
            >
              <label>
                <input
                  type="radio"
                  name="informational"
                  value="Yes"
                  checked={formData.informational === 'Yes'}
                  onChange={handleChange}
                  required
                />
                Yes
              </label>
              <label>
                <input
                  type="radio"
                  name="informational"
                  value="No"
                  checked={formData.informational === 'No'}
                  onChange={handleChange}
                />
                No
              </label>
            </div>
          </div>

          {/* Interesting Case Study Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
            <label
              style={{ display: 'block', marginBottom: '0.5rem' }}
            >
              Was the case study interesting?
            </label>
            <div
              className="radio-group"
              style={{ display: 'flex', gap: '1rem' }}
            >
              <label>
                <input
                  type="radio"
                  name="interesting"
                  value="Yes"
                  checked={formData.interesting === 'Yes'}
                  onChange={handleChange}
                  required
                />
                Yes
              </label>
              <label>
                <input
                  type="radio"
                  name="interesting"
                  value="No"
                  checked={formData.interesting === 'No'}
                  onChange={handleChange}
                />
                No
              </label>
            </div>
          </div>

          {/* Comments Field */}
          <div
            className="feedback-field"
            style={{ marginBottom: '1rem' }}
          >
            <label
              htmlFor="comments"
              style={{ display: 'block', marginBottom: '0.5rem' }}
            >
              Additional Comments
            </label>
            <textarea
              id="comments"
              name="comments"
              value={formData.comments}
              onChange={handleChange}
              required
              placeholder="Your feedback..."
              rows="5"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #ccc',
              }}
            ></textarea>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="feedback-button"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#1d4ed8',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            Submit Feedback
          </button>
        </form>
      </div>
    </>
  );
};

export default Feedback;

