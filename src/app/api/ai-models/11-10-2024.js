import { NextResponse } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import axios from 'axios';
import FormData from 'form-data';

export const dynamic = 'force-dynamic';

// Existing parsing function to extract and validate case studies without correct answers
// Existing parsing function to extract and validate case studies without correct answers
function parseCaseStudies(responseText) {
  try {
    let jsonString = '';

    // Attempt to parse JSON from code fences
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    } else {
      // Attempt to parse the entire response as JSON
      jsonString = responseText;
    }

    // Remove comments (lines starting with //)
    jsonString = jsonString.replace(/\/\/.*$/gm, '');

    // Remove trailing commas before closing brackets/braces
    jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

    // Parse the cleaned JSON string
    const parsed = JSON.parse(jsonString);

    if (!parsed.caseStudies || !Array.isArray(parsed.caseStudies)) {
      throw new Error('Invalid JSON structure: Missing "caseStudies" array.');
    }

    // Further validation
    parsed.caseStudies.forEach((cs, idx) => {
      if (!cs.scenario || !Array.isArray(cs.questions)) {
        throw new Error(`Case Study ${idx + 1} is missing "scenario" or "questions".`);
      }
      cs.questions.forEach((q, qIdx) => {
        if (!q.question || !q.options || Object.keys(q.options).length !== 4) {
          throw new Error(`Question ${qIdx + 1} in Case Study ${idx + 1} is incomplete.`);
        }
      });
    });

    // Transform into desired format
    return parsed.caseStudies.map((cs, index) => ({
      caseStudy: `Case Study ${index + 1}`,
      scenario: cs.scenario,
      questions: cs.questions.map((q) => ({
        question: q.question,
        options: Object.entries(q.options).map(([key, label]) => ({ key, label })),
      })),
    }));
  } catch (error) {
    console.error('Error parsing JSON response:', error.message);
    console.error('Received Response:', responseText);
    throw new Error('Failed to parse case studies JSON. Ensure the model outputs valid JSON.');
  }
}
function parseCaseStudiesWithAnswers(responseText) {
  try {
    let jsonString = '';

    // Attempt to parse JSON from code fences
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    } else {
      // Attempt to parse the entire response as JSON
      jsonString = responseText;
    }

    // Remove comments (lines starting with //)
    jsonString = jsonString.replace(/\/\/.*$/gm, '');

    // Remove trailing commas before closing brackets/braces
    jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

    // Parse the cleaned JSON string
    const parsed = JSON.parse(jsonString);

    if (!parsed.caseStudies || !Array.isArray(parsed.caseStudies)) {
      throw new Error('Invalid JSON structure: Missing "caseStudies" array.');
    }

    // Further validation
    parsed.caseStudies.forEach((cs, idx) => {
      if (!cs.scenario || !Array.isArray(cs.questions)) {
        throw new Error(`Case Study ${idx + 1} is missing "scenario" or "questions".`);
      }
      cs.questions.forEach((q, qIdx) => {
        if (
          !q.question ||
          !q.options ||
          Object.keys(q.options).length !== 4 ||
          !q['correct answer'] ||
          !q['Hint']
        ) {
          throw new Error(`Question ${qIdx + 1} in Case Study ${idx + 1} is incomplete.`);
        }
      });
    });

    // Transform into desired format including correct answers and hints
    return parsed.caseStudies.map((cs, index) => ({
      caseStudy: `Case Study ${index + 1}`,
      scenario: cs.scenario,
      questions: cs.questions.map((q) => ({
        question: q.question,
        options: Object.entries(q.options).map(([key, label]) => ({ key, label })),
        correctAnswer: q['correct answer'],
        hint: q['Hint'],
      })),
    }));
  } catch (error) {
    console.error('Error parsing JSON response with answers:', error.message);
    console.error('Received Response:', responseText);
    throw new Error('Failed to parse case studies JSON with correct answers. Ensure the model outputs valid JSON.');
  }
}

export async function POST(request) {
  // Retrieve the API keys and environment variables from environment
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  const PINECONE_ENV = process.env.PINECONE_ENVIRONMENT;

  const pc = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });
  const index = pc.Index('rag-riz').namespace('ns1'); // Ensure 'rag' is your index name and 'ns1' is your namespace

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  // Extract request body
  const { department, role, specialization, userType } = await request.json();
  const query = `Department: ${department}, Role: ${role}, Specialization: ${specialization};`;

  // Create an embedding for the input query
  let queryEmbedding;
  try {
    const embeddingResponse = await openai.embeddings.create({
      input: query,
      model: 'text-embedding-ada-002',
    });

    if (
      !embeddingResponse.data ||
      !Array.isArray(embeddingResponse.data) ||
      embeddingResponse.data.length === 0
    ) {
      throw new Error('Invalid embedding data structure.');
    }

    queryEmbedding = embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    return NextResponse.json(
      { error: 'Failed to create embedding for the query.' },
      { status: 500 }
    );
  }

  // Query Pinecone for similar case studies
  let similarCaseStudies = [];
  try {
    const pineconeResponse = await index.query({
      vector: queryEmbedding,
      topK: 3,
      includeMetadata: true,
    });

    similarCaseStudies = pineconeResponse.matches.map(
      (match) => match.metadata.content
    );
  } catch (error) {
    console.error('Error querying Pinecone:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve similar case studies from Pinecone.' },
      { status: 500 }
    );
  }

  // Construct the prompt with retrieved case studies
  const retrievedCasesText = similarCaseStudies.join('\n');

  let META_PROMPT;

  if (userType === 'clinical') {
    META_PROMPT = `Please generate 4 medical case studies, each approximately 150 words, featuring a scenario for a ${role} in the ${department} department specializing in ${specialization}. Use the following ${retrievedCasesText} to help generate detailed and descriptive medical case studies. Each case study should:

- **Include the following details before the case study:**
  - **Role:** Specify the role of the individual involved.
  - **Department:** Indicate the department where the scenario takes place.
  - **Specialization:** Mention the specialization of the role.

- **Case Study Content:**
  - Include a different medical error that occurred by the ${role} or by the team.
  - Incorporate characters with diverse ethnicity names, and genders. For each character specify their pronouns in parentheses, use diverse pronouns. (don't provide the ethnicity)
  - The medical studies should be detailed and focus on the situation, medical error, and consequences.
  - The case study should use different styles of narrating such as including emotions between characters, describe the environment, include different medical employees, and be more descriptive. Use formal and English.
  - Do not include the steps taken to resolve the issue; focus solely on presenting the scenario.

- **For each case study, create 3 unique multiple-choice questions that:**
  - Have 4 option choices each.
  - Provide the correct answer choice and answer in the format: correct answer: C) Validate and Verify
  - Provide the hint in the format: Hint: Double-checking and confirming accuracy before proceeding.
  - In the question include specific key words hints based on the correct answer choice, utilizing the definition of the relevant error prevention tool to assist the user. The error prevention tool name should not be included in the question.
  - The question should be strictly from the perspective of the ${role}.
  - Each question should strictly focus on the assigned Error Prevention Tool and how it could have been applied to prevent the error in the case study.
  - Include clues by using buzzwords or synonyms from the correct answer's definition.
  - Do not explicitly mention the prevention tools by name in the question header.

- **Strictly follow the Question Structure Below and make sure the options choices matchs the correct error prevention tool focused in the question:**
  - **Question Structure**
  
    **Case Study 1:**
    - Question 1: Focuses on Peer Checking and Coaching
    - Question 2: Focuses on Debrief
    - Question 3: Focuses on ARCC

    **Case Study 2:**
    - Question 1: Focuses on Validate and Verify
    - Question 2: Focuses on STAR
    - Question 3: Focuses on No Distraction Zone

    **Case Study 3:**
    - Question 1: Focuses on Effective Handoffs
    - Question 2: Focuses on Read and Repeat Back
    - Question 3: Focuses on Ask Clarifying Questions

    **Case Study 4:**
    - Question 1: Focuses on Alphanumeric Language
    - Question 2: Focuses on SBAR
    - Question 3: Focuses on STAR

- **Use the following 11 Error Prevention Tools and Definitions:**

a. Peer Checking and Coaching
    Definition: Peer Check (Ask your colleagues to review your work and offer assistance in reviewing the work of others). Peer Coach (coach to reinforce: celebrate it publicly when someone does something correctly, coach to correct: correct someone (privately when possible) when something is done incorrectly.)

b. Debrief
    Definition: Reflect on what went well, what didn't, how to improve, and who will follow through. All team members should freely speak up. A debrief typically lasts only 3 minutes.

c. ARCC
    Definition: Ask a question to gently prompt the other person of potential safety issue, Request a change to make sure the person is fully aware of the risk. Voice a Concern if the person is resistant. Use the Chain of command if the possibility of patient harm persists.

d. Validate and Verify
    Definition: An internal Check (Does this make sense to me?, Is it right, based on what I know?, Is this what I expected?, Does this information "fit in with my past experience or other information I may have at this time?). Verify (check with an independent qualified source).

e. STAR
    Definition: Stop (pause for 2 seconds to focus on task at hand), Think (consider action you're about to take), Act (concentrate and carry out the task), Review (check to make sure the task was done right and you got the right result).

f. No Distraction Zone
    Definition: 1) Avoid interrupting others while they are performing critical tasks 2) Avoid distractions while completing critical tasks: Use phrases like "Stand by" or "Hold on".

g. Effective Handoffs
    Definition: Six important principles that make an Effective Handoffs: Standardized and streamlined, Distraction-Free Environment, Face-to-face/bedside (interactive), Acknowledgments/repeat backs, Verbal with written/ printed information, Opportunity for questions/clarification.

h. Read and Repeat Back
    Definition: 1) Sender communicates information to receiver, 2) receiver listens or writes down the information and reads/repeats it back as written or heard to the sender. 3) Sender then acknowledges the accuracy of the read-back by stating "that's correct". If not correct the sender repeats/clarifies the communication beginning the three steps again.

i. Ask Clarifying Questions
    Definition: Requesting Additional information, and expressing concerns to avoid misunderstandings.

j. Using Alphanumeric Language
    Definition: Consists of using clear letters and numbers in communication such as replacing fifteen with one-five, and using phonetic alphabet letters instead of Latin alphabet.

k. SBAR
    Definition: Situation (what is the situation, patient or project?), Background (what is important to communicate including problems and precautions?), Assessment (what is my assessment of the situation, problems, and precautions.), Recommendations (what is my recommendation, request, or plan?)

Ensure the following format is strictly followed and output the entire response as valid JSON.

\`\`\`json
{
  "caseStudies": [
    {
      },
        "department" : "${department}",
        "role" : "${role}",
        "specialization": "${specialization}",
    },

      "caseStudy": "Case Study 1",
      "scenario": "Description of the case study scenario.",
      "questions": [
        {
          "question": "Question 1 text",
          "options": {
            "A": "Option A",
            "B": "Option B",
            "C": "Option C",
            "D": "Option D"
          },
          "correct answer": "C) correct answer",
          "Hint": "1 sentence sumarized definition of correct answer choice."
        },
        {
          "question": "Question 2 text",
          "options": {
            "A": "Option A",
            "B": "Option B",
            "C": "Option C",
            "D": "Option D"
          },
          "correct answer": "b) correct answer",
          "Hint": "1 sentence sumarized definition of correct answer choice."
        },
        {
          "question": "Question 3 text",
          "options": {
            "A": "Option A",
            "B": "Option B",
            "C": "Option C",
            "D": "Option D"
          },
          "correct answer": "A) correct answer ",
          "Hint": "1 sentence sumarized definition of correct answer choice."
        }
      ]
   }
    // Repeat for Case Study 2, 3, and 4
  ]
}
\`\`\`

**Ensure that:**

- The JSON is **well-formatted** and **free of any syntax errors**.
- There are **no comments** (e.g., lines starting with \`//\`), **no trailing commas**, and **no additional text** outside the JSON block.
- The JSON is enclosed within \`\`\`json and \`\`\` code fences.

Do not include any additional text outside of the JSON structure.

**Note:**

- Each **Error Prevention Tool** is used **exactly once** across all case studies and questions.
- **No repetition** of the same **Error Prevention Tool** occurs within the same case study or across different case studies.
- All **case studies** are **unique** and focus on **distinct Error Prevention Tools**.
- The **Question Structure** is strictly followed to ensure consistency and adherence to the specified guidelines.

**Example:**

\`\`\`json
{
  },
    "department" : "Operating Room",
    "role" : "Surgeon",
    "specialization": "General Surgery"
},
  "caseStudies": [
    {
      "caseStudy": "Case Study 1",
      "scenario": "Dr. Patel (he/him), an orthopedic surgeon, was finishing up a knee replacement surgery when the patient’s implant arrived. In the rush to keep things on schedule, he quickly began installing it without double-checking the lot number. Minutes later, the scrub nurse noticed the implant package didn't match the patient’s chart. Dr. Patel’s colleague, Dr. Lin (she/her), was nearby and always emphasized the importance of a final check before any major step.",
      "questions": [
        {
          "question": "Dr. Patel could have avoided this mix-up by practicing which Error Prevention Tool, which focuses on verifying actions with a internal verification and checking with qualified source?",
          "options": {
            "A": "Peer Checking and Coaching",
            "B": "Debrief",
            "C": "ARCC",
            "D": "Validate and Verify"
          },
          "correct answer": "D) Validate and Verify",
          "Hint": "Does this make sense to me?, Is it right, based on what I know?, Is this what I expected?, Does this information "fit in with my past experience or other information I may have at this time?"
        },
        {
          "question": "If Dr. Patel would have stopped the line to address concerns immediately, which Error Prevention Tool that focuses on stopping and addressing concerns would he be applying?",
          "options": {
            "A": "STAR",
            "B": "No Distraction Zone",
            "C": "ARCC",
            "D": "Effective Handoffs"
          },
          "correct answer": "C) ARCC",
          "Hint": "Ask a question to gently prompt the other person of potential safety issue"
        },
        {
          "question": "After the surgery, Dr. Patel and his team discussed ways to prevent future errors. This reflection represents which Error Prevention Tool, designed to identify improvements and assign follow-up actions?",
          "options": {
            "A": "ARCC",
            "B": "Debrief",
            "C": "No Distraction Zone",
            "D": "Read and Repeat Back"
          },
          "correct answer": "B) Debrief",
          "Hint": "3 minute discussion focusing on what went well and areas for improvement."
        }
      ]
    }
    // Additional case studies...
  ]
}
\`\`\`

Ensure that:

- The JSON is **well-formatted** and **free of any syntax errors**.
- There are **no comments** (e.g., lines starting with \`//\`), **no trailing commas**, and **no additional text** outside the JSON block.
- The JSON is enclosed within \`\`\`json and \`\`\` code fences.

Do not include any additional text outside of the JSON structure.`;

  } else if (userType === 'non-clinical') {
    META_PROMPT = `Please generate 4 medical case studies, each approximately 150 words, featuring a scenario for a ${role} in the ${department} department specializing in ${specialization}. Use the following ${retrievedCasesText} to help generate detailed and descriptive medical case studies. Each case study should:

    - **Include the following details before the case study:**
      - **Role:** Specify the role of the individual involved.
      - **Department:** Indicate the department where the scenario takes place.
      - **Specialization:** Mention the specialization of the role.
    
    - **Case Study Content:**
      - Include a different medical error that occurred by the ${role} or by the team.
      - Incorporate characters with diverse ethnicity names, and genders. For each character specify their pronouns in parentheses, use diverse pronouns. (don't provide the ethnicity)
      - The medical studies should be detailed and focus on the situation, medical error, and consequences.
      - The case study should use different styles of narrating such as including emotions between characters, describe the environment, include different medical employees, and be more descriptive. Use formal and English.
      - Do not include the steps taken to resolve the issue; focus solely on presenting the scenario.
    
    - **For each case study, create 3 unique multiple-choice questions that:**
      - Have 4 option choices each.
      - Provide the correct answer choice and answer in the format: correct answer: C) Validate and Verify
      - Provide the hint in the format: Hint: Double-checking and confirming accuracy before proceeding.
      - In the question include specific key words hints based on the correct answer choice, utilizing the definition of the relevant error prevention tool to assist the user. The error prevention tool name should not be included in the question.
      - The question should be strictly from the perspective of the ${role}.
      - Each question should strictly focus on the assigned Error Prevention Tool and how it could have been applied to prevent the error in the case study.
      - Include clues by using buzzwords or synonyms from the correct answer's definition.
      - Do not explicitly mention the prevention tools by name in the question header.
    
    - **Strictly follow the Question Structure Below and make sure the options choices matchs the correct error prevention tool focused in the question:**
      - **Question Structure**
      
        **Case Study 1:**
        - Question 1: Focuses on Peer Checking and Coaching
        - Question 2: Focuses on Debrief
        - Question 3: Focuses on ARCC
    
        **Case Study 2:**
        - Question 1: Focuses on Validate and Verify
        - Question 2: Focuses on STAR
        - Question 3: Focuses on No Distraction Zone
    
        **Case Study 3:**
        - Question 1: Focuses on Effective Handoffs
        - Question 2: Focuses on Read and Repeat Back
        - Question 3: Focuses on Ask Clarifying Questions
    
        **Case Study 4:**
        - Question 1: Focuses on Alphanumeric Language
        - Question 2: Focuses on SBAR
        - Question 3: Focuses on No Distraction Zone
    - **Use the following 11 Error Prevention Tools and Definitions:**
    
    a. Peer Checking and Coaching
        Definition: Peer Check (Ask your colleagues to review your work and offer assistance in reviewing the work of others). Peer Coach (coach to reinforce: celebrate it publicly when someone does something correctly, coach to correct: correct someone (privately when possible) when something is done incorrectly.)
    
    b. Debrief
        Definition: Reflect on what went well, what didn't, how to improve, and who will follow through. All team members should freely speak up. A debrief typically lasts only 3 minutes.
    
    c. ARCC
        Definition: Ask a question to gently prompt the other person of potential safety issue, Request a change to make sure the person is fully aware of the risk. Voice a Concern if the person is resistant. Use the Chain of command if the possibility of patient harm persists.
    
    d. Validate and Verify
        Definition: An internal Check (Does this make sense to me?, Is it right, based on what I know?, Is this what I expected?, Does this information "fit in with my past experience or other information I may have at this time?). Verify (check with an independent qualified source).
    
    e. STAR
        Definition: Stop (pause for 2 seconds to focus on task at hand), Think (consider action you're about to take), Act (concentrate and carry out the task), Review (check to make sure the task was done right and you got the right result).
    
    f. No Distraction Zone
        Definition: 1) Avoid interrupting others while they are performing critical tasks 2) Avoid distractions while completing critical tasks: Use phrases like "Stand by" or "Hold on".
    
    g. Effective Handoffs
        Definition: Six important principles that make an Effective Handoffs: Standardized and streamlined, Distraction-Free Environment, Face-to-face/bedside (interactive), Acknowledgments/repeat backs, Verbal with written/ printed information, Opportunity for questions/clarification.
    
    h. Read and Repeat Back
        Definition: 1) Sender communicates information to receiver, 2) receiver listens or writes down the information and reads/repeats it back as written or heard to the sender. 3) Sender then acknowledges the accuracy of the read-back by stating "that's correct". If not correct the sender repeats/clarifies the communication beginning the three steps again.
    
    i. Ask Clarifying Questions
        Definition: Requesting Additional information, and expressing concerns to avoid misunderstandings.
    
    j. Using Alphanumeric Language
        Definition: Consists of using clear letters and numbers in communication such as replacing fifteen with one-five, and using phonetic alphabet letters instead of Latin alphabet.
    
    k. SBAR
        Definition: Situation (what is the situation, patient or project?), Background (what is important to communicate including problems and precautions?), Assessment (what is my assessment of the situation, problems, and precautions.), Recommendations (what is my recommendation, request, or plan?)
    
    Ensure the following format is strictly followed and output the entire response as valid JSON.
    
    \`\`\`json
    {
      "caseStudies": [
        {
          },
            "department" : "${department}",
            "role" : "${role}",
        },
    
          "caseStudy": "Case Study 1",
          "scenario": "Description of the case study scenario.",
          "questions": [
            {
              "question": "Question 1 text",
              "options": {
                "A": "Option A",
                "B": "Option B",
                "C": "Option C",
                "D": "Option D"
              },
              "correct answer": "C) correct answer",
              "Hint": "1 sentence sumarized definition of correct answer choice."
            },
            {
              "question": "Question 2 text",
              "options": {
                "A": "Option A",
                "B": "Option B",
                "C": "Option C",
                "D": "Option D"
              },
              "correct answer": "b) correct answer",
              "Hint": "1 sentence sumarized definition of correct answer choice."
            },
            {
              "question": "Question 3 text",
              "options": {
                "A": "Option A",
                "B": "Option B",
                "C": "Option C",
                "D": "Option D"
              },
              "correct answer": "A) correct answer ",
              "Hint": "1 sentence sumarized definition of correct answer choice."
            }
          ]
       }
        // Repeat for Case Study 2, 3, and 4
      ]
    }
    \`\`\`
    
    **Ensure that:**
    
    - The JSON is **well-formatted** and **free of any syntax errors**.
    - There are **no comments** (e.g., lines starting with \`//\`), **no trailing commas**, and **no additional text** outside the JSON block.
    - The JSON is enclosed within \`\`\`json and \`\`\` code fences.
    
    Do not include any additional text outside of the JSON structure.
    
    **Note:**
    
    - Each **Error Prevention Tool** is used **exactly once** across all case studies and questions.
    - **No repetition** of the same **Error Prevention Tool** occurs within the same case study or across different case studies.
    - All **case studies** are **unique** and focus on **distinct Error Prevention Tools**.
    - The **Question Structure** is strictly followed to ensure consistency and adherence to the specified guidelines.
    
    **Example:**
    
    \`\`\`json
    {
      "caseStudies": [
        {
          },
        "department" : "Communication",
        "role" : "Surgeon",
    },
          "caseStudy": "Case Study 1",
          "scenario": "Susan was updating the intranet home page with a long and detailed safety alert that needed to go out immediately based on a safety event that had recently occurred at one of the system’s hospitals. She was rushing between tasks and quickly published the page for all 50,000 employees. Moments later, she got an angry email from the system Chief Medical Officer informing her that she got the part number wrong and that this was causing staff to place orders on the wrong product. Her cubicle neighbor Mike was an excellent proofreader and was always happy to assist his coworker when asked.",
          "questions": [
            {
              "question": "Susan could have prevented potential harm to patients by utilizing which of the following strategies involving peer support?",
              "options": {
                "A": "Debrief",
                "B": "ARCC",
                "C": "Peer Checking and Coaching",
                "D": "STAR"
              },
              correct answer: C) Peer Checking and Coaching
              "Hint": "Encouraging colleagues to review and assist in confirming decisions."
            },
            {
              "question": "After publishing the incorrect safety alert, Susan could have engaged in which of the following to analyze and learn from the mistake?",
              "options": {
                "A": "Debrief",
                "B": "ARCC",
                "C": "Peer Checking and Coaching",
                "D": "STAR"
              },
              correct answer: A) Debrief
              "Hint": "What went well and areas for improvement."
            },
            {
              "question": "What communication framework could Susan have used to express concerns and prevent errors effectively?",
              "options": {
                "A": "Debrief",
                "B": "ARCC",
                "C": "Peer Checking and Coaching",
                "D": "STAR"
              },
              correct answer: B) ARCC
              "Hint": "Voice concern and activate chain of command."
            }
          ]
          // Additional case studies...
        }
      ]
    }
    \`\`\`
    
    Ensure that:
    
    - The JSON is **well-formatted** and **free of any syntax errors**.
    - There are **no comments** (e.g., lines starting with \`//\`), **no trailing commas**, and **no additional text** outside the JSON block.
    - The JSON is enclosed within \`\`\`json and \`\`\` code fences.
    
    Do not include any additional text outside of the JSON structure.`;
  } else {
    console.error('Invalid userType:', userType);
    return NextResponse.json(
      { error: 'Invalid userType provided.' },
      { status: 400 }
    );
  }

  try {
    // Make a request to OpenAI's Chat Completion API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: META_PROMPT,
        },
      ],
      temperature: 0.0,
      max_tokens: 6000,
      stream: false,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error('No choices returned from OpenAI.');
    }

    const aiResponse = response.choices[0].message.content;

    if (!aiResponse) {
      throw new Error('No content returned from OpenAI.');
    }

    console.log('Raw Model Output:', aiResponse);

    // Parse the AI response using the existing function (without correct answers)
    const parsedCaseStudies = parseCaseStudies(aiResponse);

    // Parse the AI response using the new function (including correct answers and hints)
    let parsedCaseStudiesWithAnswers = parseCaseStudiesWithAnswers(aiResponse);

    console.log('Parsed Model Output:', parsedCaseStudiesWithAnswers);

    // Now, generate image prompts for each case study
    try {
      // For each case study, generate an image prompt
      const caseStudiesWithImagePrompts = await Promise.all(
        parsedCaseStudiesWithAnswers.map(async (caseStudy) => {
          const { prompt } = await generateImagePrompt(caseStudy);
          return {
            ...caseStudy,
            imagePrompt: prompt,
          };
        })
      );

      // Now, fetch images for case studies
      const caseStudiesWithImages = await fetchImagesForCaseStudies(caseStudiesWithImagePrompts);

      // Update parsedCaseStudiesWithAnswers with images
      parsedCaseStudiesWithAnswers = caseStudiesWithImages;

      // Also update parsedCaseStudies (the one without correct answers), if needed
      // For simplicity, let's update parsedCaseStudies similarly
      const parsedCaseStudiesWithImages = parsedCaseStudiesWithAnswers.map(cs => ({
        caseStudy: cs.caseStudy,
        scenario: cs.scenario,
        questions: cs.questions.map(q => ({
          question: q.question,
          options: q.options,
        })),
        imageUrl: cs.imageUrl,
        role: cs.role,
        department: cs.department,
        specialization: cs.specialization,
      }));

      return NextResponse.json({
        caseStudies: parsedCaseStudiesWithImages,
        aiResponse: parsedCaseStudiesWithAnswers,
      });

    } catch (error) {
      console.error('Error generating images:', error);
      return NextResponse.json(
        { error: 'Failed to generate images for case studies.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}


// Function to generate image prompt via OpenAI
async function generateImagePrompt(caseStudy) {
  // Customize META_PROMPT using caseStudy.scenario if needed
  // Here, we'll keep META_PROMPT as a fixed system prompt and use caseStudy.scenario in the user message
  const META_PROMPT = `
You are an expert prompt engineer tasked with creating detailed and descriptive prompts for image generation based on given scenarios. Your prompts should be clear, vivid, and free of any NSFW (Not Safe For Work) content. Ensure that the prompts are suitable for use with image generation models and accurately reflect the provided scenario.

# Guidelines

- **Understand the Scenario**: Carefully read the provided scenario to grasp the context, key elements, and desired visual aspects.
- **Detail and Clarity**: Include specific details such as settings, characters, objects, actions, and emotions to create a vivid image in the mind of the image generation model.
- **Realistic**: Ensure characters and objects are proportionate and realistic. All body parts and features should be accurate and appropriately associated.
- **Avoid NSFW Content**: Ensure that the prompt does not contain or imply any inappropriate, offensive, or unsafe content.
- **Language and Tone**: Use clear and concise language. Maintain a neutral and professional tone.
- **Formatting**: Present the prompt as a single, well-structured paragraph without any markdown or code blocks.
- **Consistency**: Maintain consistency in descriptions, avoiding contradictions or vague terms.
- **Descriptive Adjectives**: Utilize descriptive adjectives to enhance the visual richness of the prompt.
- **Characters**: Characters should consist of different races, genders, and religions.

# Steps

1. **Analyze the Scenario**: Identify the main elements such as location, characters, objects, and actions.
2. **Expand on Details**: Add descriptive elements to each identified component to enrich the prompt.
3. **Ensure Appropriateness**: Review the prompt to eliminate any NSFW content or implications.
4. **Finalize the Prompt**: Ensure the prompt is cohesive, vivid, and suitable for image generation.

# Output Format

- **Format**: Plain text paragraph.
- **Length**: Approximately 20 - 30 words, providing sufficient detail without being overly verbose.
- **Style**: Descriptive and clear, suitable for feeding directly into an image generation model.

# Example

**Image Prompt**:
"A bustling hospital emergency room at night, illuminated by bright overhead lights. Doctors and nurses in white coats move swiftly between beds, attending to patients with focused expressions. Medical equipment and monitors line the walls, while the atmosphere is tense yet organized, reflecting the urgency of a busy night shift."

# Notes

- **Edge Cases**: If the scenario is abstract or lacks detail, infer reasonable visual elements to create a coherent prompt.
- **Cultural Sensitivity**: Be mindful of cultural nuances and avoid stereotypes or biased representations.
- **No NSFW Content**: Double-check to ensure the prompt adheres to safety guidelines and does not contain any inappropriate content.
`.trim();

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured.');
  }

  // Validate the scenario
  if (typeof caseStudy.scenario !== 'string' || caseStudy.scenario.trim() === '') {
    throw new Error('Invalid scenario provided to generateImagePrompt.');
  }

  // Call the OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: META_PROMPT,
        },
        {
          role: 'user',
          content: 'Scenario:\n' + caseStudy.scenario,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('OpenAI API Error:', errorData);
    throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const generatedPrompt = data.choices[0]?.message?.content;

  if (!generatedPrompt) {
    throw new Error('No prompt generated by OpenAI.');
  }

  return { prompt: generatedPrompt };
}

async function fetchImagesForCaseStudies(
  caseStudies,
  model = 'sd3-large-turbo',
  aspect_ratio = '1:1'
) {
  try {
    const responses = await Promise.all(
      caseStudies.map(async (caseStudy) => {
        try {
          if (!caseStudy.imagePrompt) {
            console.warn(`No image prompt for ${caseStudy.caseStudy}. Skipping image generation.`);
            return { ...caseStudy, imageUrl: null };
          }

          const generatedPrompt = caseStudy.imagePrompt; // Corrected Line

          const payload = {
            prompt: generatedPrompt, // Use the correct prompt
            output_format: 'jpeg',
            model,
            aspect_ratio,
            width: 512, // Increased width for better quality
            height: 512, // Increased height for better quality
          };

          const formData = new FormData();
          Object.keys(payload).forEach((key) =>
            formData.append(key, payload[key])
          );

          const response = await axios.post(
            `https://api.stability.ai/v2beta/stable-image/generate/sd3`,
            formData,
            {
              validateStatus: undefined,
              responseType: 'arraybuffer',
              headers: {
                Authorization: `Bearer ${process.env.STABILITY_API_KEY}`, // Secure your API key in environment variables
                Accept: 'image/*',
              },
            }
          );


          // **Insert the console.log here to inspect the response data**
          console.log('Stability API Response:', response.data);

          if (response.status === 200) {
            // Adjust the path based on the actual response structure
            const base64Image = Buffer.from(response.data).toString('base64');
            return {
              ...caseStudy,
              imageUrl: `data:image/jpeg;base64,${base64Image}`,
            };
          } else {
            console.warn(
              `Failed to generate image for ${caseStudy.caseStudy}. Status: ${response.status}`,
              response.data
            );
            return { ...caseStudy, imageUrl: null };
          }
        } catch (error) {
          if (error.response) {
            // Server responded with a status other than 2xx
            console.error('Stability API Error:', error.response.status, error.response.data);
          } else if (error.request) {
            // No response received
            console.error('No response received from Stability API:', error.request);
          } else {
            // Other errors
            console.error('Error generating image:', error.message);
          }
          return { ...caseStudy, imageUrl: null };
        }
      })
    );

    return responses;
  } catch (error) {
    console.error('Error in fetchImagesForCaseStudies:', error.message);
    throw error;
  }
}