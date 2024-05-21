import { redis, REDIS_KEYS } from '~/server/redis/client';

async function getBucketNames(key: string) {
  const currentBucket = await redis.packed.hGet<string[]>(REDIS_KEYS.QUEUES.BUCKETS, key);
  if (currentBucket && !Array.isArray(currentBucket)) return [currentBucket];
  return currentBucket ?? [];
}

function getNewBucket(key: string) {
  return `${REDIS_KEYS.QUEUES.BUCKETS}:${key}:${Date.now()}`;
}

export async function addToQueue(key: string, ids: number | number[] | Set<number>) {
  if (!Array.isArray(ids)) {
    if (ids instanceof Set) ids = Array.from(ids);
    else ids = [ids];
  }
  const currentBuckets = await getBucketNames(key);
  let targetBucket = currentBuckets[0];
  if (!targetBucket) {
    targetBucket = getNewBucket(key);
    await redis.packed.hSet(REDIS_KEYS.QUEUES.BUCKETS, key, targetBucket);
  }
  await redis.packed.sAdd(targetBucket, ids);
}

export async function checkoutQueue(key: string, isMerge = false) {
  if (!isMerge) await waitForMerge(key);

  // Get the current buckets
  const currentBuckets = await getBucketNames(key);

  // Append new bucket
  const newBucket = getNewBucket(key);
  await redis.packed.hSet(REDIS_KEYS.QUEUES.BUCKETS, key, [newBucket, ...currentBuckets]);

  // Fetch the content of the current buckets
  const content = new Set<number>();
  if (currentBuckets) {
    for (const bucket of currentBuckets) {
      const bucketContent = (await redis.packed.sMembers<number>(bucket)) ?? [];
      for (const id of bucketContent) content.add(id);
    }
  }

  return {
    content: [...content],
    commit: async () => {
      // Remove the reference to the processed buckets
      const existingBuckets = await getBucketNames(key);
      const newBuckets = existingBuckets.filter((bucket) => !currentBuckets.includes(bucket));
      await redis.packed.hSet(REDIS_KEYS.QUEUES.BUCKETS, key, newBuckets);

      // Remove the processed buckets
      if (currentBuckets.length > 0) await redis.del(currentBuckets);
    },
  };
}

async function waitForMerge(key: string) {
  let isMerging = await redis.exists(`${REDIS_KEYS.QUEUES.BUCKETS}:${key}:merging`);
  while (isMerging) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    isMerging = await redis.exists(`${REDIS_KEYS.QUEUES.BUCKETS}:${key}:merging`);
  }
}

export async function mergeQueue(key: string) {
  // Set the merging lock
  await redis.set(`${REDIS_KEYS.QUEUES.BUCKETS}:${key}:merging`, '1', {
    EX: 60,
  });

  // Get the current queue
  const queue = await checkoutQueue(key, true);
  if (queue.content.length > 0) {
    // If we have content, move it to the newest bucket
    await addToQueue(key, queue.content);
  }
  await queue.commit();

  // Remove the merging lock
  await redis.del(`${REDIS_KEYS.QUEUES.BUCKETS}:${key}:merging`);
}
