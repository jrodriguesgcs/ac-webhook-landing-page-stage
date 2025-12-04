const axios = require('axios');
const { LANDING_PAGES } = require('../data/landing-pages');

/**
 * Extract slug from full URL
 * Example: "www.globalcitizensolutions.com/greece-work-visa/" -> "greece-work-visa"
 */
function extractSlug(url) {
  if (!url) return null;
  
  // Remove protocol if present
  let cleanUrl = url.replace(/^https?:\/\//, '');
  
  // Remove domain
  cleanUrl = cleanUrl.replace(/^[^/]+\//, '');
  
  // Remove trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, '');
  
  // Remove any remaining path segments (keep only the last one)
  const segments = cleanUrl.split('/');
  const slug = segments[segments.length - 1] || segments[segments.length - 2];
  
  return slug || null;
}

/**
 * Get stage for a given landing page URL
 */
function getStageForLandingPage(landingPageUrl) {
  const slug = extractSlug(landingPageUrl);
  
  if (!slug) {
    console.log('No slug found');
    return null;
  }
  
  console.log(`Extracted slug: "${slug}"`);
  
  // Direct match
  if (LANDING_PAGES[slug]) {
    return LANDING_PAGES[slug];
  }
  
  // Try with trailing slash
  if (LANDING_PAGES[slug + '/']) {
    return LANDING_PAGES[slug + '/'];
  }
  
  // Try without trailing slash
  const slugWithoutSlash = slug.replace(/\/$/, '');
  if (LANDING_PAGES[slugWithoutSlash]) {
    return LANDING_PAGES[slugWithoutSlash];
  }
  
  console.log(`No stage found for slug: "${slug}"`);
  return null;
}

/**
 * Update contact custom field in ActiveCampaign
 */
async function updateContactField(contactId, fieldId, fieldValue, apiUrl, apiKey) {
  try {
    const response = await axios.put(
      `${apiUrl}/contacts/${contactId}`,
      {
        contact: {
          fieldValues: [
            {
              field: fieldId,
              value: fieldValue
            }
          ]
        }
      },
      {
        headers: {
          'Api-Token': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error updating contact field:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Main webhook handler - Vercel serverless function
 */
module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== Webhook received ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // Get environment variables
    const AC_API_URL = process.env.AC_API_URL;
    const AC_API_KEY = process.env.AC_API_KEY;

    // Validate environment variables
    if (!AC_API_URL || !AC_API_KEY) {
      console.error('Missing environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Extract data from webhook
    const data = req.body;
    
    // Extract contact ID - ActiveCampaign sends it as contact[id]
    const contactId = 
      data['contact[id]'] || 
      data.contact?.id;
      
    // Extract landing page - try multiple possible field locations
    const landingPage = 
      data['contact[fields][232]'] ||  // Field ID 232
      data['contact[fields][first_touch_landing_page]'] ||  // Field name
      data['contact[LANDING_PAGE]'] ||
      data['contact[FIRST_TOUCH_LANDING_PAGE]'] ||
      data.landing_page ||
      data.first_touch_landing_page ||
      data.contact?.fields?.LANDING_PAGE ||
      data.contact?.fields?.FIRST_TOUCH_LANDING_PAGE ||
      data.contact?.fields?.[232] ||
      data.contact?.fields?.first_touch_landing_page;
    
    console.log(`Contact ID: ${contactId}`);
    console.log(`Landing Page: ${landingPage}`);
    
    if (!contactId) {
      console.error('No contact ID provided');
      return res.status(400).json({ 
        error: 'No contact ID provided',
        received: data
      });
    }

    if (!landingPage) {
      console.log('No landing page provided, skipping');
      return res.status(200).json({ 
        success: true,
        message: 'No landing page to process',
        contactId: contactId
      });
    }

    // Get the stage for this landing page
    const stage = getStageForLandingPage(landingPage);
    
    if (!stage) {
      console.log(`No stage found for landing page: ${landingPage}`);
      return res.status(200).json({ 
        success: true,
        message: 'Landing page not in mapping',
        contactId: contactId,
        landingPage: landingPage
      });
    }

    console.log(`✓ Stage identified: ${stage}`);
    
    // Update the contact field (Field ID 272 - Website Page Stage)
    await updateContactField(contactId, '272', stage, AC_API_URL, AC_API_KEY);
    
    console.log(`✓ Contact ${contactId} updated successfully with stage: ${stage}`);
    
    return res.status(200).json({ 
      success: true,
      message: 'Contact field updated successfully',
      contactId: contactId,
      landingPage: landingPage,
      slug: extractSlug(landingPage),
      stage: stage
    });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};