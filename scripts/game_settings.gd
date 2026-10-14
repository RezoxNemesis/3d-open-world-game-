extends RefCounted

const FILE_PATH := "user://settings.json"
const MAX_BYTES := 4096
const DEFAULTS := {
	"quality": "balanced", "sensitivity": 1.0, "joystick_scale": 1.0, "camera_distance": 6.0
}
const LIMITS := {
	"sensitivity": [0.4, 2.0], "joystick_scale": [0.75, 1.4], "camera_distance": [3.5, 8.0]
}

var values: Dictionary = DEFAULTS.duplicate()


func reset_defaults() -> void:
	values = DEFAULTS.duplicate()


func set_value(key: String, value: Variant) -> bool:
	if key == "quality":
		if typeof(value) != TYPE_STRING or value not in ["performance", "balanced", "high"]:
			return false
	elif LIMITS.has(key):
		if typeof(value) not in [TYPE_FLOAT, TYPE_INT]:
			return false
		var number := float(value)
		var bounds: Array = LIMITS[key]
		if not is_finite(number) or number < bounds[0] or number > bounds[1]:
			return false
		value = number
	else:
		return false
	values[key] = value
	return true


func load_settings(path: String = FILE_PATH) -> void:
	reset_defaults()
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return
	if file.get_length() > MAX_BYTES:
		file.close()
		return
	var json := JSON.new()
	var text := file.get_as_text()
	file.close()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return
	var data: Dictionary = json.data
	var version: Variant = data.get("version")
	if typeof(version) not in [TYPE_INT, TYPE_FLOAT] or version != 1:
		return
	var stored: Variant = data.get("values")
	if typeof(stored) != TYPE_DICTIONARY:
		return
	for key in DEFAULTS:
		if stored.has(key):
			set_value(key, stored[key])


func save_settings(path: String = FILE_PATH) -> bool:
	var temporary := path + ".tmp"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({"version": 1, "values": values}))
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		DirAccess.remove_absolute(temporary)
		return false
	if DirAccess.rename_absolute(temporary, path) != OK:
		DirAccess.remove_absolute(temporary)
		return false
	return true
