(function () {
  "use strict";

  const STORAGE_KEY = "todo.items.v1";

  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const list = document.getElementById("todo-list");
  const count = document.getElementById("count");
  const clearBtn = document.getElementById("clear-completed");
  const filterButtons = document.querySelectorAll(".filter");

  let todos = load();
  let filter = "all"; // all | active | completed

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("Failed to load todos:", e);
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      console.warn("Failed to save todos:", e);
    }
  }

  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    todos.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: trimmed,
      completed: false,
    });
    save();
    render();
  }

  function toggleTodo(id) {
    const t = todos.find((x) => x.id === id);
    if (t) {
      t.completed = !t.completed;
      save();
      render();
    }
  }

  function deleteTodo(id) {
    todos = todos.filter((x) => x.id !== id);
    save();
    render();
  }

  function clearCompleted() {
    todos = todos.filter((x) => !x.completed);
    save();
    render();
  }

  function visibleTodos() {
    if (filter === "active") return todos.filter((t) => !t.completed);
    if (filter === "completed") return todos.filter((t) => t.completed);
    return todos;
  }

  function render() {
    list.innerHTML = "";

    const items = visibleTodos();

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent =
        filter === "all" ? "Nothing here yet. Add your first task!" : "No " + filter + " tasks.";
      list.appendChild(li);
    } else {
      for (const t of items) {
        const li = document.createElement("li");
        li.className = "todo-item" + (t.completed ? " completed" : "");
        li.dataset.id = t.id;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = t.completed;
        checkbox.addEventListener("change", () => toggleTodo(t.id));

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = t.text;

        const del = document.createElement("button");
        del.className = "delete";
        del.setAttribute("aria-label", "Delete task");
        del.textContent = "×";
        del.addEventListener("click", () => deleteTodo(t.id));

        li.append(checkbox, label, del);
        list.appendChild(li);
      }
    }

    const remaining = todos.filter((t) => !t.completed).length;
    count.textContent = remaining + (remaining === 1 ? " item left" : " items left");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    addTodo(input.value);
    input.value = "";
    input.focus();
  });

  clearBtn.addEventListener("click", clearCompleted);

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
  });

  render();
})();
