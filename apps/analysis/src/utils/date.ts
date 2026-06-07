export function formatDate(date: Date | null): string {
	if (!date) {
		return "N/A";
	}

	return date.toISOString().split("T")[0];
}
