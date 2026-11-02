// Demo page: each section renders the files its input handed to the page.
// No uploads happen; the "upload size" is the multipart body a form POST would send.

function formatBytes(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

/** Render `files` as a table (preview, name, type, size, dimensions) into `container`. */
async function renderFileList(container, files) {
  for (const media of container.querySelectorAll("img, video")) URL.revokeObjectURL(media.src);
  if (files.length === 0) {
    container.replaceChildren();
    return;
  }

  const table = document.createElement("table");
  table.innerHTML =
    "<thead><tr><th>Preview</th><th>Name</th><th>Type</th><th>Size</th><th>Dimensions</th></tr></thead>";
  const body = table.createTBody();
  for (const file of files) {
    const row = body.insertRow();
    const isVideo = file.type.startsWith("video/");
    const preview = document.createElement(isVideo ? "video" : "img");
    const dimensions = document.createElement("td");
    if (isVideo) {
      preview.muted = true;
      preview.controls = true;
      preview.preload = "metadata";
      preview.addEventListener("loadedmetadata", () => {
        dimensions.textContent = `${preview.videoWidth} × ${preview.videoHeight}, ${preview.duration.toFixed(1)} s`;
      });
    } else {
      preview.alt = "";
      preview.addEventListener("load", () => {
        dimensions.textContent = `${preview.naturalWidth} × ${preview.naturalHeight}`;
      });
    }
    preview.src = URL.createObjectURL(file);
    row.insertCell().append(preview);

    const name = row.insertCell();
    name.className = "name";
    name.textContent = file.name;
    const type = row.insertCell();
    type.textContent = file.type || "(unknown)";
    if (file.type === "image/webp" || file.type === "video/mp4") type.className = "webp";
    row.insertCell().textContent = formatBytes(file.size);
    row.append(dimensions);
  }

  const form = new FormData();
  for (const file of files) form.append("images", file);
  const uploadSize = (await new Response(form).blob()).size;
  const total = document.createElement("p");
  total.className = "total";
  total.textContent = `${files.length} file${files.length === 1 ? "" : "s"}, upload size ${formatBytes(uploadSize)}`;

  container.replaceChildren(table, total);
}

// 1, 4 and 6: plain inputs with change listeners.
for (const [inputId, outputId] of [
  ["plain-input", "plain-output"],
  ["strict-input", "strict-output"],
  ["video-input", "video-output"],
]) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  input.addEventListener("change", () => renderFileList(output, [...input.files]));
}

// 2: React keeps the files in state via onChange.
{
  const h = React.createElement;

  function FileList({ files }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      renderFileList(ref.current, files);
    }, [files]);
    return h("div", { ref, className: "output" });
  }

  function ReactUploader() {
    const [files, setFiles] = React.useState([]);
    return h(
      React.Fragment,
      null,
      h("input", {
        type: "file",
        accept: "image/*",
        multiple: true,
        onChange: (event) => setFiles([...event.target.files]),
      }),
      h(FileList, { files }),
    );
  }

  ReactDOM.createRoot(document.getElementById("react-root")).render(h(ReactUploader));
}

// 5: Dropzone.js. autoProcessQueue is off because this static server can't take
// uploads; the table lists every file Dropzone queued.
{
  Dropzone.autoDiscover = false;
  const output = document.getElementById("dropzone-output");
  const queued = [];
  const dropzone = new Dropzone("#dropzone-demo", {
    autoProcessQueue: false,
    acceptedFiles: "image/*",
    dictDefaultMessage: "Drag and drop images here<br>or click to choose files",
  });
  dropzone.on("addedfile", (file) => {
    queued.push(file);
    renderFileList(output, queued);
  });
}

// 3: the input lives in an open shadow root. `change` doesn't leave the shadow
// root, so the component listens inside it.
customElements.define(
  "shadow-uploader",
  class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `
        <link rel="stylesheet" href="demo.css" />
        <input type="file" accept="image/*" multiple />
        <div class="output"></div>`;
      const input = root.querySelector("input");
      const output = root.querySelector(".output");
      input.addEventListener("change", () => renderFileList(output, [...input.files]));
    }
  },
);
