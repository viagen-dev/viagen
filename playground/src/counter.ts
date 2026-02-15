export function setupCounter(element: HTMLButtonElement) {
  let counter = 2
  const setCounter = (count: number) => {
    counter = count
    element.innerHTML = `count is ${counter}`
  }
  element.addEventListener('click', () => setCounter(counter + 1))
  setCounter(2)
}
