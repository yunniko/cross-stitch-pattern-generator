//! The settings of one generation, as they arrive: values by name (G-099, D293).
//!
//! Nothing here knows what the settings are. Each family of algorithm takes the ones it reads, by name, where that
//! family is defined (`EdgeMode::from_settings`, the overlays' `configure`, and so on); what nobody took is refused by
//! name when the reading is over. So a setting is added by reading it in the module that uses it, and a setting the
//! request carries that no module reads is an error rather than a value silently ignored.
//!
//! No JSON in it: `json.rs` fills it from the request, so the pipeline's own modules need no parser.

use std::collections::BTreeMap;

/// One value. A list or an object is kept as the text it arrived as, for the one module that knows its shape.
#[derive(Clone, Debug, PartialEq)]
pub enum Setting {
    Flag(bool),
    Number(f64),
    Text(String),
    Other(String),
}

#[derive(Clone, Debug, Default)]
pub struct Settings {
    values: BTreeMap<String, Setting>,
}

impl Settings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, name: impl Into<String>, value: Setting) {
        self.values.insert(name.into(), value);
    }

    /// Takes a flag. `None` when the request does not carry it.
    pub fn flag(&mut self, name: &str) -> Result<Option<bool>, String> {
        match self.values.remove(name) {
            None => Ok(None),
            Some(Setting::Flag(value)) => Ok(Some(value)),
            Some(_) => Err(format!("{name} must be true or false")),
        }
    }

    /// Takes a number.
    pub fn number(&mut self, name: &str) -> Result<Option<f64>, String> {
        match self.values.remove(name) {
            None => Ok(None),
            Some(Setting::Number(value)) => Ok(Some(value)),
            Some(_) => Err(format!("{name} must be a number")),
        }
    }

    /// Takes a whole number that is not negative: a count.
    pub fn count(&mut self, name: &str) -> Result<Option<usize>, String> {
        match self.number(name)? {
            None => Ok(None),
            Some(value) if value >= 0.0 && value.fract() == 0.0 && value <= usize::MAX as f64 => {
                Ok(Some(value as usize))
            }
            Some(_) => Err(format!("{name} must be a whole number, not negative")),
        }
    }

    /// Takes a word: the id of a mode.
    pub fn text(&mut self, name: &str) -> Result<Option<String>, String> {
        match self.values.remove(name) {
            None => Ok(None),
            Some(Setting::Text(value)) => Ok(Some(value)),
            Some(_) => Err(format!("{name} must be text")),
        }
    }

    /// Takes a list or an object, as its text.
    pub fn other(&mut self, name: &str) -> Result<Option<String>, String> {
        match self.values.remove(name) {
            None => Ok(None),
            Some(Setting::Other(value)) => Ok(Some(value)),
            Some(_) => Err(format!("{name} must be a list or an object")),
        }
    }

    /// The reading is over: a setting nobody took is refused by name.
    pub fn finish(self) -> Result<(), String> {
        match self.values.keys().next() {
            None => Ok(()),
            Some(name) => Err(format!(
                "unknown setting {name}: nothing in the pipeline reads it"
            )),
        }
    }
}
