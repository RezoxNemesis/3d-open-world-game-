extends RefCounted
## A bounded record of the most recent regions and their calmed guardians.

const LIMIT := 128
const MAX_SECTOR := 781250
var visited: Array[Vector2i] = []
var pacified: Array[Vector2i] = []


func visit(sector: Vector2i) -> void:
	if sector in visited:
		return
	visited.append(sector)
	if visited.size() > LIMIT:
		pacified.erase(visited.pop_front())


func calm(sector: Vector2i) -> void:
	visit(sector)
	if sector not in pacified:
		pacified.append(sector)


func snapshot() -> Dictionary:
	var regions: Array = []
	for sector in visited:
		regions.append([sector.x, sector.y, sector in pacified])
	return {"regions": regions}


func restore(data: Variant) -> bool:
	if not data is Dictionary or not data.get("regions") is Array:
		return false
	if data.regions.size() > LIMIT:
		return false
	var next_visited: Array[Vector2i] = []
	var next_pacified: Array[Vector2i] = []
	for entry in data.regions:
		if not _valid_entry(entry):
			return false
		var sector := Vector2i(int(entry[0]), int(entry[1]))
		if sector in next_visited:
			return false
		next_visited.append(sector)
		if entry[2]:
			next_pacified.append(sector)
	visited = next_visited
	pacified = next_pacified
	return true


func _valid_entry(entry: Variant) -> bool:
	if not entry is Array or entry.size() != 3 or not entry[2] is bool:
		return false
	for index in [0, 1]:
		if not (entry[index] is int or entry[index] is float):
			return false
		var value := float(entry[index])
		if not is_finite(value) or value != floor(value) or absf(value) > MAX_SECTOR:
			return false
	return true
