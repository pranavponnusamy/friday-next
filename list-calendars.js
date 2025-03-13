import 'dotenv/config'
import Nylas from 'nylas'

const NylasConfig = {
  apiKey: process.env.NYLAS_API_KEY,
  apiUri: process.env.NYLAS_API_URI,
}

const nylas = new Nylas(NylasConfig);

async function fetchAvailableCalendars() {
  try {
    const calendars = await nylas.calendars.list({
      identifier: process.env.NYLAS_GRANT_ID,
      limit: 10
    })

    console.log('Available Calendars:');
    
    if (calendars.length === 0) {
      console.log('No calendars found.');
      return;
    }

    // Print calendar details in a formatted manner
    calendars.forEach((calendar, index) => {
      console.log(`\nCalendar #${index + 1}`);
      console.log(`ID: ${calendar.id}`);
      console.log(`Name: ${calendar.name || 'No name'}`);
      console.log(`Description: ${calendar.description || 'No description'}`);
      console.log(`Read only: ${calendar.readOnly ? 'Yes' : 'No'}`);
      console.log('-'.repeat(50));
    });

    console.log('\nTo configure a calendar ID, add it to your .env.local file:');
    console.log('CALENDAR_ID=your_chosen_calendar_id');
  } catch (error) {
    console.error('Error fetching calendars:', error)
  }
}

fetchAvailableCalendars()
