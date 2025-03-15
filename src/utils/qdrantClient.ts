import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Qdrant client
export const getQdrantClient = () => {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;

  if (!url || !apiKey) {
    throw new Error("Qdrant URL or API key not found in environment variables");
  }

  return new QdrantClient({
    url,
    apiKey,
  });
};

// Initialize Google Generative AI for embeddings
export const getGeminiEmbeddingModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key not found in environment variables");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-embedding-exp-03-07" });
};

// Collection name
export const TASKS_COLLECTION = "friday_tasks";

// Vector dimensions from Gemini embedding model
export const VECTOR_SIZE = 3072; // Gemini embedding-exp model produces 3072-dimensional vectors

// Check if collection exists, create if it doesn't
export const ensureCollection = async () => {
  const client = getQdrantClient();
  
  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const collectionExists = collections.collections.some(
      (collection) => collection.name === TASKS_COLLECTION
    );

    if (!collectionExists) {
      console.log(`Creating collection ${TASKS_COLLECTION} with vector size ${VECTOR_SIZE}`);
      // Create collection if it doesn't exist
      await client.createCollection(TASKS_COLLECTION, {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
        optimizers_config: {
          default_segment_number: 2,
        }
      });
      console.log(`Created collection: ${TASKS_COLLECTION}`);
    } else {
      console.log(`Collection ${TASKS_COLLECTION} already exists`);
      
      // Verify vector configuration
      try {
        const collectionInfo = await client.getCollection(TASKS_COLLECTION);
        const actualVectorSize = collectionInfo.config?.params?.vectors?.size;
        
        // If vector size doesn't match, recreate the collection
        if (actualVectorSize !== VECTOR_SIZE) {
          console.log(`Vector size mismatch: expected ${VECTOR_SIZE}, got ${actualVectorSize}. Recreating collection.`);
          
          // Delete and recreate collection 
          await client.deleteCollection(TASKS_COLLECTION);
          await client.createCollection(TASKS_COLLECTION, {
            vectors: {
              size: VECTOR_SIZE,
              distance: "Cosine",
            },
            optimizers_config: {
              default_segment_number: 2,
            }
          });
          console.log(`Recreated collection: ${TASKS_COLLECTION} with correct vector size`);
        }
      } catch (infoError) {
        console.error("Error verifying collection configuration:", infoError);
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error ensuring collection:", error);
    return false;
  }
};

// Generate embeddings for text
export const generateEmbeddings = async (text: string): Promise<number[]> => {
  try {
    const model = getGeminiEmbeddingModel();
    const result = await model.embedContent(text);
    const embeddings = result.embedding.values;
    console.log(`Generated embeddings with length: ${embeddings.length}`);
    return embeddings;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
};

// Upsert task to Qdrant
export const upsertTask = async (
  taskId: string,
  taskText: string,
  taskPayload: Record<string, unknown>
) => {
  await ensureCollection();
  const client = getQdrantClient();
  
  try {
    const embeddings = await generateEmbeddings(taskText);
    
    if (embeddings.length !== VECTOR_SIZE) {
      throw new Error(`Embedding vector length (${embeddings.length}) does not match expected size (${VECTOR_SIZE})`);
    }
    
    // Qdrant accepts string IDs but we need to make sure it's in a compatible format
    // For safety, we'll convert the UUID to a numeric format by removing hyphens
    // and treating it as a hexadecimal string
    const uuidWithoutHyphens = taskId.replace(/-/g, '');
    
    // Generate a simpler, numeric ID by taking a portion of the UUID
    // This avoids potential issues with string IDs in some Qdrant configurations
    const numericId = parseInt(uuidWithoutHyphens.substring(0, 8), 16);
    
    console.log(`Upserting task with ID: ${numericId} (derived from ${taskId})`);
    console.log(`Vector length: ${embeddings.length}`);
    
    await client.upsert(TASKS_COLLECTION, {
      points: [
        {
          id: numericId,
          vector: embeddings,
          payload: {
            ...taskPayload,
            original_id: taskId // Store the original UUID for reference
          },
        },
      ],
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error upserting task to Qdrant:", error);
    
    // Log more detailed information for HTTP errors
    if (error && typeof error === 'object' && 'data' in error) {
      console.error("Qdrant error details:", JSON.stringify(error.data, null, 2));
    }
    
    return { success: false, error };
  }
};

// Search for similar tasks
export const searchSimilarTasks = async (queryText: string, limit = 5) => {
  console.log("=========================================================");
  console.log(`SEARCHING FOR SIMILAR TASKS - Query: "${queryText.substring(0, 50)}..."`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=========================================================");
  
  await ensureCollection();
  const client = getQdrantClient();
  
  try {
    console.log(`Generating embeddings for search query...`);
    const embeddings = await generateEmbeddings(queryText);
    
    console.log(`Searching Qdrant collection '${TASKS_COLLECTION}' with limit=${limit}...`);
    const searchResults = await client.search(TASKS_COLLECTION, {
      vector: embeddings,
      limit,
    });
    
    console.log(`Search complete. Found ${searchResults.length} similar tasks`);
    if (searchResults.length > 0) {
      console.log(`First result score: ${searchResults[0].score}`);
      console.log(`First result payload: ${JSON.stringify(searchResults[0].payload, null, 2)}`);
    }
    
    return {
      success: true,
      tasks: searchResults,
      count: searchResults.length
    };
  } catch (error) {
    console.error("ERROR SEARCHING FOR SIMILAR TASKS:", error);
    return {
      success: false,
      error,
      tasks: []
    };
  }
};
