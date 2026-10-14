extends RefCounted
## Versioned local save data. Invalid or incompatible data never moves the player.

const LANDMARK_IDS := ["sanctuary", "lotus", "gate"]


func save_position(value: Vector3, path: String = "user://save.json") -> bool:
	if not valid_coordinates([value.x, value.y, value.z]):
		return false
	var data := {"version": 1, "position": [value.x, value.y, value.z]}
	return write_atomic(data, path)


func save_state(position: Vector3, discovered: Array, path: String = "user://save.json") -> bool:
	var coordinates := [position.x, position.y, position.z]
	if not valid_coordinates(coordinates) or not valid_discovery(discovered):
		return false
	return write_atomic({"version": 2, "position": coordinates, "discovered": discovered}, path)


func write_atomic(data: Dictionary, path: String) -> bool:
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		DirAccess.remove_absolute(path + ".tmp")
		return false
	if DirAccess.rename_absolute(path + ".tmp", path) != OK:
		DirAccess.remove_absolute(path + ".tmp")
		return false
	return true


func load_position(
	path: String = "user://save.json", fallback: Vector3 = Vector3(0, 2, 12)
) -> Vector3:
	return load_state(path, fallback).position


func load_state(
	path: String = "user://save.json", fallback: Vector3 = Vector3(0, 2, 12)
) -> Dictionary:
	var invalid := {"position": fallback, "discovered": [], "valid": false}
	if not FileAccess.file_exists(path):
		return invalid
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > 4096:
		return invalid
	var parser := JSON.new()
	var parse_result := parser.parse(file.get_as_text())
	var data = parser.data
	var version: Variant = data.get("version") if data is Dictionary else null
	if (
		parse_result != OK
		or not data is Dictionary
		or typeof(version) not in [TYPE_FLOAT, TYPE_INT]
		or (version != 1 and version != 2)
	):
		return invalid
	var coordinates = data.get("position")
	if not valid_coordinates(coordinates):
		return invalid
	var discovered: Array = []
	if data.version == 2:
		if not valid_discovery(data.get("discovered")):
			return invalid
		discovered = data.discovered
	return {
		"position": Vector3(coordinates[0], coordinates[1], coordinates[2]),
		"discovered": discovered,
		"valid": true
	}


func valid_discovery(ids: Variant) -> bool:
	if not ids is Array or ids.size() > LANDMARK_IDS.size():
		return false
	var seen := {}
	for id in ids:
		if not id is String or id not in LANDMARK_IDS or seen.has(id):
			return false
		seen[id] = true
	return true


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
