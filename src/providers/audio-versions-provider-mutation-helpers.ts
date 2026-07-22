interface EntityWithId {
	id: string;
}

export function findEntityById<T extends EntityWithId>(
	entities: T[],
	entityId: string,
): T | undefined {
	return entities.find((entity) => entity.id === entityId);
}

export function patchEntityById<T extends EntityWithId>(
	entities: T[],
	entityId: string,
	patch: Partial<T> | ((entity: T) => T),
): T[] {
	return entities.map((entity) => {
		if (entity.id !== entityId) {
			return entity;
		}

		return typeof patch === "function"
			? patch(entity)
			: { ...entity, ...patch };
	});
}

export function removeEntityById<T extends EntityWithId>(
	entities: T[],
	entityId: string,
): T[] {
	return entities.filter((entity) => entity.id !== entityId);
}
