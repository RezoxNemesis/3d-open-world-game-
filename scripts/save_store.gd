extends RefCounted
## Versioned local save data. Invalid or incompatible data never moves the player.


func save_position(value: Vector3, path: String = "user://save.json") -> bool:
	var data := {"version": 1, "position": [value.x, value.y, value.z]}
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.close()
	return DirAccess.rename_absolute(path + ".tmp", path) == OK


func load_position(
	path: String = "user://save.json", fallback: Vector3 = Vector3(0, 2, 12)
) -> Vector3:
	if not FileAccess.file_exists(path):
		return fallback
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > 4096:
		return fallback
	var parser := JSON.new()
	if parser.parse(file.get_as_text()) != OK:
		return fallback
	var data = parser.data
	if not data is Dictionary or data.get("version") != 1:
		return fallback
	var coordinates = data.get("position")
	if not valid_coordinates(coordinates):
		return fallback
	return Vector3(coordinates[0], coordinates[1], coordinates[2])


func valid_coordinates(coordinates: Variant) -> bool:
	if not coordinates is Array or coordinates.size() != 3:
		return false
	for value in coordinates:
		if not (value is float or value is int) or not is_finite(float(value)):
			return false
	var point := Vector3(coordinates[0], coordinates[1], coordinates[2])
	return (
		absf(point.x) <= 10000 and absf(point.z) <= 10000 and point.y >= -100 and point.y <= 10000
	)
